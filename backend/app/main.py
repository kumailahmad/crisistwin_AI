import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import admin, assistant, auth, datasets, districts, incidents, reports, resources, risk, simulations
from app.core.config import EPHEMERAL_DB, settings
from sqlalchemy import text

from app.core.database import Base, engine

def _ensure_admin() -> None:
    """Create the administrator named by ADMIN_EMAIL / ADMIN_PASSWORD if missing. Never overwrites an existing password."""
    if not (settings.admin_email and settings.admin_password):
        return
    if len(settings.admin_password) < 10:
        logging.getLogger("uvicorn.error").error("ADMIN_PASSWORD ignored: use at least 10 characters")
        return
    from sqlalchemy import select
    from app.core.database import SessionLocal
    from app.core.security import hash_password
    from app.models import User
    email = settings.admin_email.strip().lower()
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == email))
        if u is None:
            db.add(User(email=email, hashed_password=hash_password(settings.admin_password), role="admin", full_name="Administrator"))
        elif u.role != "admin":
            u.role = "admin"
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        Base.metadata.create_all(engine)  # use Alembic migrations for production schema changes
        _ensure_admin()
    except Exception as exc:  # keep the API up so /health can say what is wrong instead of crashing at startup
        logging.getLogger("uvicorn.error").error("Database init failed: %s", exc)
    yield


app = FastAPI(title="CrisisTwin AI API", version="0.2.0", lifespan=lifespan)


@app.middleware("http")
async def safe_errors(request: Request, call_next):
    # Registered before CORS so that 500 responses still carry CORS headers.
    try:
        return await call_next(request)
    except Exception:
        return JSONResponse({"detail": "Internal server error"}, status_code=500)


app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"])

for r in (auth, districts, risk, simulations, resources, assistant, reports, admin, datasets, incidents):
    app.include_router(r.router, prefix="/api/v1")


@app.get("/health")
def health():
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse({"status": "degraded", "database": "unreachable"}, status_code=503)
    if EPHEMERAL_DB:
        return {"status": "ok", "database": "ephemeral-sqlite", "version": app.version,
                "warning": "DATABASE_URL is not set: data is lost between requests. Set a hosted PostgreSQL URL."}
    return {"status": "ok", "database": "ok", "version": app.version}
