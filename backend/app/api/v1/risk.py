from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.districts import get_or_404
from app.core.database import get_db
from app.core.permissions import get_current_user
from app.models import RiskAssessment, User
from app.schemas import RiskIn, RiskOut
from app.services import risk_engine

router = APIRouter(prefix="/risk", tags=["risk"])
FACTORS = list(risk_engine.DEFAULT_WEIGHTS)


@router.post("/assess", response_model=RiskOut, status_code=201)
def assess(body: RiskIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_or_404(db, body.district_id)
    inputs = {k: getattr(body, k) for k in FACTORS}
    result = risk_engine.assess(inputs, body.input_status)
    row = RiskAssessment(district_id=body.district_id, user_id=user.id, inputs=inputs, result=result,
                         score=result["score"], category=result["category"])
    db.add(row)
    db.commit()
    return row


@router.get("/assessments", response_model=list[RiskOut])
def list_assessments(district_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(RiskAssessment).order_by(RiskAssessment.id.desc())
    if user.role != "admin":
        q = q.where(RiskAssessment.user_id == user.id)
    if district_id:
        q = q.where(RiskAssessment.district_id == district_id)
    return list(db.scalars(q))


@router.get("/assessments/{assessment_id}", response_model=RiskOut)
def get_assessment(assessment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(RiskAssessment, assessment_id)
    if not row or (user.role != "admin" and row.user_id != user.id):
        raise HTTPException(404, "Assessment not found")
    return row
