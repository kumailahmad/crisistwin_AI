import re
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.permissions import get_current_user, require_admin
from app.models import Incident, IncidentMedia, User
from app.services import incidents as svc
from app.utils import audit

router = APIRouter(prefix="/incidents", tags=["incidents"])

_submits: dict[int, deque] = defaultdict(deque)
MAX_PER_HOUR = 8
PHONE_RE = re.compile(r"^[+0-9][0-9 \-()]{5,24}$")


class ReviewIn(BaseModel):
    status: Literal["pending", "verified", "rejected", "resolved"] | None = None
    severity: Literal["low", "medium", "high", "critical"] | None = None
    admin_note: str | None = Field(default=None, max_length=1000)


def _limit(user: User):
    q, t = _submits[user.id], time.monotonic()
    while q and t - q[0] > 3600:
        q.popleft()
    if len(q) >= MAX_PER_HOUR:
        raise HTTPException(429, "Too many reports in the last hour. If this is an emergency, call Police 15.")
    q.append(t)


def _out(i: Incident, *, public: bool = False, similar: int | None = None) -> dict:
    d = {
        "id": i.id, "code": i.code, "type": i.type, "severity": i.severity, "description": i.description,
        "latitude": i.latitude, "longitude": i.longitude, "place_text": i.place_text,
        "district_id": i.district_id, "district_name": i.district.name if i.district else None,
        "status": i.status, "created_at": i.created_at, "observed_at": i.observed_at,
        "photo_count": len(i.media),
    }
    if not public:
        d.update({
            "accuracy_m": i.accuracy_m, "location_source": i.location_source, "contact_phone": i.contact_phone,
            "people_affected": i.people_affected, "admin_note": i.admin_note, "reviewed_at": i.reviewed_at, "user_id": i.user_id,
            "media": [{"id": m.id, "width": m.width, "height": m.height, "size": m.size, "sha256": m.sha256} for m in i.media],
        })
    else:
        d["description"] = i.description[:300]
    if similar is not None:
        d["similar_nearby"] = similar
    return d


def _load(db: Session, iid: int) -> Incident:
    i = db.scalar(select(Incident).where(Incident.id == iid).options(selectinload(Incident.media), selectinload(Incident.district)))
    if not i:
        raise HTTPException(404, "Report not found")
    return i


@router.post("", status_code=201)
async def submit(
    type: str = Form(...), severity: str = Form("medium"), description: str = Form(...),
    latitude: float = Form(...), longitude: float = Form(...), accuracy_m: float | None = Form(None),
    location_source: str = Form("map_pin"), place_text: str | None = Form(None), contact_phone: str | None = Form(None),
    people_affected: int | None = Form(None), observed_at: datetime | None = Form(None),
    photos: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    if type not in svc.TYPES:
        raise HTTPException(422, "Unknown incident type")
    if severity not in ("low", "medium", "high", "critical"):
        raise HTTPException(422, "Unknown severity")
    description = description.strip()
    if not 10 <= len(description) <= 2000:
        raise HTTPException(422, "Describe what is happening in 10–2000 characters")
    if location_source not in ("gps", "map_pin", "search", "manual"):
        raise HTTPException(422, "Unknown location_source")
    if not (settings.bbox_min_lon <= longitude <= settings.bbox_max_lon and settings.bbox_min_lat <= latitude <= settings.bbox_max_lat):
        raise HTTPException(422, "Location is outside the Balochistan study area")
    if accuracy_m is not None and not 0 <= accuracy_m <= 100000:
        raise HTTPException(422, "Invalid GPS accuracy")
    if contact_phone and not PHONE_RE.match(contact_phone.strip()):
        raise HTTPException(422, "Contact phone looks invalid")
    if people_affected is not None and not 0 <= people_affected <= 1_000_000:
        raise HTTPException(422, "Invalid number of people")
    if observed_at and observed_at.tzinfo is None:
        observed_at = observed_at.replace(tzinfo=timezone.utc)
    if observed_at and observed_at > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise HTTPException(422, "Observed time is in the future")
    photos = [p for p in photos if p.filename]
    if len(photos) > svc.MAX_PHOTOS:
        raise HTTPException(422, f"At most {svc.MAX_PHOTOS} photos")
    processed = []
    for p in photos:  # validate everything BEFORE rate-limit counting and writing
        raw = await p.read(svc.MAX_RAW_BYTES + 1)
        try:
            processed.append(svc.sanitize_image(raw))
        except svc.BadImage as e:
            raise HTTPException(422, f"{p.filename}: {e}")
    _limit(user)

    similar = [i for i in db.scalars(select(Incident).where(
        Incident.type == type, Incident.status.in_(("pending", "verified")),
        Incident.created_at >= datetime.now(timezone.utc) - timedelta(hours=24),
        Incident.latitude.between(latitude - 0.03, latitude + 0.03), Incident.longitude.between(longitude - 0.03, longitude + 0.03)))
        if svc.km_between(latitude, longitude, i.latitude, i.longitude) <= 2.0]

    inc = Incident(
        code=svc.new_code(db), user_id=user.id, type=type, severity=severity, description=description,
        latitude=round(latitude, 6), longitude=round(longitude, 6), accuracy_m=accuracy_m, location_source=location_source,
        place_text=(place_text or "").strip()[:255] or None, contact_phone=(contact_phone or "").strip() or None,
        people_affected=people_affected, observed_at=observed_at, district_id=svc.district_at(db, latitude, longitude))
    inc.media = [IncidentMedia(**m) for m in processed]
    db.add(inc)
    db.commit()
    audit.log(db, user.id, "submit", "incident", inc.id, {"code": inc.code, "type": type, "photos": len(processed)})
    return _out(_load(db, inc.id), similar=len(similar))


@router.get("/mine")
def mine(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(Incident).where(Incident.user_id == user.id).order_by(Incident.id.desc()).limit(100)
                      .options(selectinload(Incident.media), selectinload(Incident.district)))
    return [_out(i) for i in rows]


@router.get("/public")
def public(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Reviewed incidents only (no reporter details, no photos) for the shared map."""
    rows = db.scalars(select(Incident).where(Incident.status.in_(("verified", "resolved"))).order_by(Incident.id.desc()).limit(300)
                      .options(selectinload(Incident.media), selectinload(Incident.district)))
    return [_out(i, public=True) for i in rows]


@router.get("/stats")
def stats(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    by = dict(db.execute(select(Incident.status, func.count()).group_by(Incident.status)).all())
    return {"total": sum(by.values()), **{k: by.get(k, 0) for k in ("pending", "verified", "rejected", "resolved")}}


@router.get("")
def list_all(status: str | None = None, type: str | None = None, district_id: int | None = None, limit: int = 200,
             db: Session = Depends(get_db), _: User = Depends(require_admin)):
    stmt = select(Incident).order_by(Incident.id.desc()).limit(min(limit, 500)).options(selectinload(Incident.media), selectinload(Incident.district))
    if status:
        stmt = stmt.where(Incident.status == status)
    if type:
        stmt = stmt.where(Incident.type == type)
    if district_id:
        stmt = stmt.where(Incident.district_id == district_id)
    return [_out(i) for i in db.scalars(stmt)]


@router.get("/{iid}")
def get_one(iid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    i = _load(db, iid)
    if i.user_id != user.id and user.role != "admin":
        raise HTTPException(404, "Report not found")
    return _out(i)


@router.get("/{iid}/media/{mid}")
def media(iid: int, mid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    i = _load(db, iid)
    if i.user_id != user.id and user.role != "admin":
        raise HTTPException(404, "Report not found")
    m = db.scalar(select(IncidentMedia).where(IncidentMedia.id == mid, IncidentMedia.incident_id == iid))
    if not m:
        raise HTTPException(404, "Photo not found")
    return Response(m.data, media_type=m.content_type, headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})


@router.patch("/{iid}")
def review(iid: int, body: ReviewIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    i = _load(db, iid)
    ch = body.model_dump(exclude_unset=True)
    for k, v in ch.items():
        setattr(i, k, v)
    i.reviewed_by, i.reviewed_at = admin.id, datetime.now(timezone.utc)
    db.commit()
    audit.log(db, admin.id, "review", "incident", i.id, {"code": i.code, **ch})
    return _out(_load(db, iid))


@router.delete("/{iid}", status_code=204)
def delete(iid: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    i = _load(db, iid)
    db.delete(i)
    db.commit()
    audit.log(db, admin.id, "delete", "incident", iid, {"code": i.code})
