from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, require_admin
from app.models import District, EmergencyResource, User
from app.schemas import ResourceBulkIn, ResourceIn, ResourceOut
from app.utils import audit

router = APIRouter(prefix="/resources", tags=["resources"])


def _get(db: Session, rid: int) -> EmergencyResource:
    r = db.get(EmergencyResource, rid)
    if not r:
        raise HTTPException(404, "Resource not found")
    return r


def _check_district(db: Session, district_id: int | None):
    if district_id is not None and not db.get(District, district_id):
        raise HTTPException(422, "Unknown district_id")


@router.get("", response_model=list[ResourceOut])
def list_resources(type: str | None = None, district_id: int | None = None, q: str | None = None, bbox: str | None = None,
                   db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    stmt = select(EmergencyResource).order_by(EmergencyResource.name)
    if type:
        stmt = stmt.where(EmergencyResource.type == type)
    if district_id:
        stmt = stmt.where(EmergencyResource.district_id == district_id)
    if bbox:  # minLon,minLat,maxLon,maxLat (map viewport)
        try:
            x0, y0, x1, y1 = (float(v) for v in bbox.split(","))
        except ValueError:
            raise HTTPException(422, "bbox must be minLon,minLat,maxLon,maxLat")
        stmt = stmt.where(EmergencyResource.longitude.between(x0, x1), EmergencyResource.latitude.between(y0, y1))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(EmergencyResource.name.ilike(like), EmergencyResource.address.ilike(like)))
    return list(db.scalars(stmt))


@router.post("/bulk", status_code=201)
def bulk_create(body: ResourceBulkIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """All-or-nothing import of up to 500 resources (e.g. from a CSV parsed in the browser)."""
    for it in body.items:
        _check_district(db, it.district_id)
    db.add_all(EmergencyResource(**it.model_dump()) for it in body.items)
    db.commit()
    audit.log(db, admin.id, "bulk_create", "resource", None, {"count": len(body.items)})
    return {"created": len(body.items)}


@router.get("/{resource_id}", response_model=ResourceOut)
def get_resource(resource_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _get(db, resource_id)


@router.post("", response_model=ResourceOut, status_code=201)
def create(body: ResourceIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    _check_district(db, body.district_id)
    r = EmergencyResource(**body.model_dump())
    db.add(r)
    db.commit()
    audit.log(db, admin.id, "create", "resource", r.id, {"name": r.name})
    return r


@router.put("/{resource_id}", response_model=ResourceOut)
def update(resource_id: int, body: ResourceIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    r = _get(db, resource_id)
    _check_district(db, body.district_id)
    for k, v in body.model_dump().items():
        setattr(r, k, v)
    db.commit()
    audit.log(db, admin.id, "update", "resource", r.id)
    return r


@router.delete("/{resource_id}", status_code=204)
def delete(resource_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    r = _get(db, resource_id)
    db.delete(r)
    db.commit()
    audit.log(db, admin.id, "delete", "resource", resource_id, {"name": r.name})
