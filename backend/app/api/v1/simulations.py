from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.districts import get_or_404
from app.core.database import get_db
from app.core.permissions import get_current_user
from app.models import Simulation, User
from app.schemas import SimulationDetail, SimulationIn, SimulationOut
from app.services import simulation_engine

router = APIRouter(prefix="/simulations", tags=["simulations"])


def _owned(db: Session, sim_id: int, user: User) -> Simulation:
    row = db.get(Simulation, sim_id)
    if not row or (user.role != "admin" and row.user_id != user.id):
        raise HTTPException(404, "Simulation not found")
    return row


@router.post("", response_model=SimulationDetail, status_code=201)
def create(body: SimulationIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = get_or_404(db, body.district_id)
    params = body.model_dump()
    row = Simulation(district_id=d.id, user_id=user.id, params=params, status="running")
    db.add(row)
    db.commit()
    try:
        row.results = simulation_engine.run(params, d.boundary.geometry if d.boundary else None)
        row.status = "completed"
    except Exception:
        row.status, row.results = "failed", None
    db.commit()
    return row


@router.get("", response_model=list[SimulationOut])
def list_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(Simulation).order_by(Simulation.id.desc())
    if user.role != "admin":
        q = q.where(Simulation.user_id == user.id)
    return list(db.scalars(q))


@router.get("/{simulation_id}", response_model=SimulationOut)
def get_one(simulation_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _owned(db, simulation_id, user)


@router.get("/{simulation_id}/results")
def results(simulation_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = _owned(db, simulation_id, user)
    return {"simulation_id": row.id, "parameters": row.params, "status": row.status, "results": row.results}
