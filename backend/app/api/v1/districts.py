from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.permissions import get_current_user, require_admin
from app.models import Boundary, District, User
from app.schemas import BoundaryIn, DistrictIn, DistrictOut, DistrictUpdate
from app.services.gis_service import GeometryError, validate_polygon
from app.utils import audit

router = APIRouter(prefix="/districts", tags=["districts"])


def _out(d: District) -> DistrictOut:
    out = DistrictOut.model_validate(d)
    out.has_boundary = d.boundary is not None
    return out


def get_or_404(db: Session, district_id: int) -> District:
    d = db.get(District, district_id)
    if not d:
        raise HTTPException(404, "District not found")
    return d


@router.get("", response_model=list[DistrictOut])
def list_districts(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [_out(d) for d in db.scalars(select(District).options(selectinload(District.boundary)).order_by(District.name))]


@router.get("/boundaries/all")
def all_boundaries(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """One FeatureCollection with every stored boundary: a single request for the map."""
    rows = db.scalars(select(District).options(selectinload(District.boundary)).order_by(District.name))
    feats = [{"type": "Feature", "geometry": d.boundary.geometry,
              "properties": {"district_id": d.id, "name": d.name, "verified": d.verified,
                             "source": d.boundary.source, "area_km2": d.area_km2}}
             for d in rows if d.boundary]
    return {"type": "FeatureCollection", "features": feats}


@router.get("/{district_id}", response_model=DistrictOut)
def get_district(district_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _out(get_or_404(db, district_id))


@router.get("/{district_id}/boundary")
def get_boundary(district_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    d = get_or_404(db, district_id)
    if not d.boundary:
        raise HTTPException(404, "No verified boundary is available for this district")
    b = d.boundary
    return {"type": "Feature", "geometry": b.geometry,
            "properties": {"district_id": d.id, "name": d.name, "crs": b.crs, "source": b.source}}


@router.post("", response_model=DistrictOut, status_code=201)
def create_district(body: DistrictIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if db.scalar(select(District).where(District.name == body.name)):
        raise HTTPException(409, "District already exists")
    d = District(**body.model_dump())
    db.add(d)
    db.commit()
    audit.log(db, admin.id, "create", "district", d.id, {"name": d.name})
    return _out(d)


@router.put("/{district_id}/boundary", status_code=204)
def set_boundary(district_id: int, body: BoundaryIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    d = get_or_404(db, district_id)
    try:
        validate_polygon(body.geometry)
    except GeometryError as exc:
        raise HTTPException(422, str(exc))
    if d.boundary:
        d.boundary.geometry, d.boundary.source = body.geometry, body.source
    else:
        d.boundary = Boundary(geometry=body.geometry, source=body.source)
    db.commit()
    audit.log(db, admin.id, "set_boundary", "district", d.id, {"source": body.source})


@router.patch("/{district_id}", response_model=DistrictOut)
def update_district(district_id: int, body: DistrictUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    d = get_or_404(db, district_id)
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(d, k, v)
    db.commit()
    audit.log(db, admin.id, "update", "district", d.id, changes)
    return _out(d)


@router.delete("/{district_id}", status_code=204)
def delete_district(district_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    d = get_or_404(db, district_id)
    name = d.name
    db.delete(d)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "District is referenced by assessments, simulations or resources")
    audit.log(db, admin.id, "delete", "district", district_id, {"name": name})
