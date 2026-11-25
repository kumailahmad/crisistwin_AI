from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_admin
from app.models import AuditLog, Boundary, Dataset, District, EmergencyResource, RiskAssessment, Simulation, User
from app.schemas import UserOut, UserUpdate
from app.utils import audit

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserOut])
def users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return list(db.scalars(select(User).order_by(User.id)))


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == admin.id:
        raise HTTPException(400, "Administrators cannot change their own role or status")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(u, k, v)
    db.commit()
    audit.log(db, admin.id, "update", "user", u.id, body.model_dump(exclude_none=True))
    return u


@router.get("/audit-logs")
def audit_logs(limit: int = 100, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 500)))
    return [{"id": r.id, "user_id": r.user_id, "action": r.action, "entity": r.entity, "entity_id": r.entity_id,
             "detail": r.detail, "created_at": r.created_at} for r in rows]


@router.get("/stats")
def stats(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    n = lambda stmt: db.scalar(stmt) or 0
    cnt = lambda m, *w: n(select(func.count()).select_from(m).where(*w))
    by_cat = dict(db.execute(select(RiskAssessment.category, func.count()).group_by(RiskAssessment.category)).all())
    by_type = dict(db.execute(select(EmergencyResource.type, func.count()).group_by(EmergencyResource.type)).all())
    return {
        "users": cnt(User), "active_users": cnt(User, User.is_active), "admins": cnt(User, User.role == "admin"),
        "districts": cnt(District), "districts_verified": cnt(District, District.verified),
        "districts_with_boundary": cnt(Boundary),
        "resources": cnt(EmergencyResource), "resources_verified": cnt(EmergencyResource, EmergencyResource.verified),
        "resources_by_type": by_type, "datasets": cnt(Dataset), "datasets_verified": cnt(Dataset, Dataset.verified),
        "assessments": cnt(RiskAssessment), "assessments_by_category": by_cat, "simulations": cnt(Simulation),
        "simulations_failed": cnt(Simulation, Simulation.status == "failed"),
    }
