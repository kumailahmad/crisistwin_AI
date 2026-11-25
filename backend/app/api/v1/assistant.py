import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import ChatMessage, District, EmergencyResource, RiskAssessment, Simulation, User
from app.schemas import ChatIn, ChatOut
from app.services import contacts, gemini_service
from app.utils.rate_limit import ai_rate_limit

router = APIRouter(prefix="/assistant", tags=["assistant"])
DISCLAIMER = "Prototype assistant. Not an official warning source. In an emergency contact local authorities."


def build_context(db: Session, user: User, body: ChatIn) -> dict:
    ctx: dict = {"official_helplines": contacts.helplines_for_ai(), "helplines_note": contacts.load()["disclaimer"]}
    if body.district_id:
        d = db.get(District, body.district_id)
        if not d:
            raise HTTPException(404, "District not found")
        ctx["district"] = {"id": d.id, "name": d.name, "verified": d.verified, "has_boundary": d.boundary is not None}
        last = db.scalar(select(RiskAssessment).where(RiskAssessment.district_id == d.id)
                         .order_by(RiskAssessment.id.desc()))
        if last:
            ctx["latest_risk_assessment"] = {"id": last.id, "category": last.category, "score": last.score,
                                             "missing": last.result.get("missing")}
        ctx["hospital_directory_from_health_department"] = contacts.hospitals_in(d.name)
        ctx["resources"] = [{"name": r.name, "type": r.type, "verified": r.verified, "phone": r.phone if r.verified else None}
                            for r in db.scalars(select(EmergencyResource).where(EmergencyResource.district_id == d.id).limit(10))]
    if body.simulation_id:
        s = db.get(Simulation, body.simulation_id)
        if not s or (user.role != "admin" and s.user_id != user.id):
            raise HTTPException(404, "Simulation not found")
        ctx["simulation"] = {"id": s.id, "params": s.params, "status": s.status,
                             "indicators": (s.results or {}).get("risk_indicators")}
    if body.assessment_id:
        a = db.get(RiskAssessment, body.assessment_id)
        if not a or (user.role != "admin" and a.user_id != user.id):
            raise HTTPException(404, "Assessment not found")
        ctx["assessment"] = {"id": a.id, "category": a.category, "score": a.score, "result": a.result}
    return ctx


@router.post("/chat", response_model=ChatOut)
def chat(body: ChatIn, db: Session = Depends(get_db), user: User = Depends(ai_rate_limit)):
    ctx = build_context(db, user, body)
    prompt = f"Language: {body.language}\nContext (JSON): {json.dumps(ctx, default=str)}\nQuestion: {body.message}"
    try:
        reply = gemini_service.call_ai(prompt)
    except gemini_service.AIUnavailable:
        raise HTTPException(503, "AI assistant is not configured on this server")
    except gemini_service.AIFailure:
        raise HTTPException(502, "The AI provider could not answer right now. Please try again.")
    db.add_all([ChatMessage(user_id=user.id, role="user", content=body.message, language=body.language),
                ChatMessage(user_id=user.id, role="assistant", content=reply, language=body.language)])
    db.commit()
    return ChatOut(reply=reply, language=body.language, context_used=ctx, disclaimer=DISCLAIMER)
