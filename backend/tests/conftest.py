import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models import District, User
from app.utils import rate_limit


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, expire_on_commit=False)
    s = S()
    yield s
    s.close()


@pytest.fixture()
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    rate_limit._hits.clear()
    yield TestClient(app)
    app.dependency_overrides.clear()


def _token(client, email, pw="password123"):
    return {"Authorization": "Bearer " + client.post("/api/v1/auth/login", json={"email": email, "password": pw}).json()["access_token"]}


@pytest.fixture()
def user_h(client):
    client.post("/api/v1/auth/register", json={"email": "u@example.com", "password": "password123"})
    return _token(client, "u@example.com")


@pytest.fixture()
def admin_h(client, db):
    db.add(User(email="a@example.com", hashed_password=hash_password("password123"), role="admin"))
    db.commit()
    return _token(client, "a@example.com")


@pytest.fixture()
def district(db):
    d = District(name="Test District", data_source="test fixture")
    db.add(d)
    db.commit()
    return d


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    from app.utils import rate_limit
    rate_limit._fails.clear()
    getattr(rate_limit, "_hits", {}).clear()
    yield
