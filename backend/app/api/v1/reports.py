from collections import Counter
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user
from app.models import District, EmergencyResource, RiskAssessment, Simulation, User

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/overview")
def overview(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    count = lambda m: db.scalar(select(func.count()).select_from(m))
    return {"districts": count(District), "risk_assessments": count(RiskAssessment), "simulations": count(Simulation),
            "emergency_resources": count(EmergencyResource),
            "verified_resources": db.scalar(select(func.count()).select_from(EmergencyResource).where(EmergencyResource.verified)),
            "data_note": "Counts reflect records stored in this database only."}


@router.get("/risk")
def risk_report(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(RiskAssessment)
    if user.role != "admin":
        q = q.where(RiskAssessment.user_id == user.id)
    rows = list(db.scalars(q))
    return {"total": len(rows), "by_category": dict(Counter(r.category for r in rows)),
            "disclaimer": "Prototype heuristic scores. Not verified flood predictions."}


@router.get("/simulations/{simulation_id}/pdf")
def simulation_pdf(simulation_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    s = db.get(Simulation, simulation_id)
    if not s or (user.role != "admin" and s.user_id != user.id):
        raise HTTPException(404, "Simulation not found")
    d = db.get(District, s.district_id)
    res = s.results or {}
    ind = res.get("risk_indicators", {})
    lines = [f"CrisisTwin AI - Simulation report #{s.id}", f"District: {d.name}", f"Status: {s.status}",
             f"Rainfall: {s.params['rainfall_intensity_mm_h']} mm/h for {s.params['duration_h']} h",
             f"Total rainfall: {res.get('total_rainfall_mm')} mm",
             f"Indicator category: {ind.get('category')} (score {ind.get('score')})",
             f"Data coverage: {ind.get('coverage')}", "", "Assumptions:", *[f"- {a}" for a in res.get("assumptions", [])],
             "", "Limitations:", *[f"- {a}" for a in res.get("limitations", [])], "",
             "Hypothetical scenario output. Not a verified prediction."]
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    y = 800
    for line in lines:
        c.drawString(50, y, line[:100])
        y -= 16
    c.save()
    return Response(buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="simulation-{s.id}.pdf"'})
