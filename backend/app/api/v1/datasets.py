from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, require_admin
from app.models import Dataset, User
from app.schemas import DatasetIn, DatasetOut
from app.utils import audit

router = APIRouter(prefix="/datasets", tags=["datasets"])


def _get(db: Session, did: int) -> Dataset:
    d = db.get(Dataset, did)
    if not d:
        raise HTTPException(404, "Dataset not found")
    return d


@router.get("", response_model=list[DatasetOut])
def list_datasets(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return list(db.scalars(select(Dataset).order_by(Dataset.name)))


@router.post("", response_model=DatasetOut, status_code=201)
def create(body: DatasetIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if db.scalar(select(Dataset).where(Dataset.name == body.name)):
        raise HTTPException(409, "Dataset name already exists")
    d = Dataset(**body.model_dump())
    db.add(d)
    db.commit()
    audit.log(db, admin.id, "create", "dataset", d.id, {"name": d.name})
    return d


@router.put("/{dataset_id}", response_model=DatasetOut)
def update(dataset_id: int, body: DatasetIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    d = _get(db, dataset_id)
    for k, v in body.model_dump().items():
        setattr(d, k, v)
    db.commit()
    audit.log(db, admin.id, "update", "dataset", d.id)
    return d


@router.delete("/{dataset_id}", status_code=204)
def delete(dataset_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    d = _get(db, dataset_id)
    name = d.name
    db.delete(d)
    db.commit()
    audit.log(db, admin.id, "delete", "dataset", dataset_id, {"name": name})
