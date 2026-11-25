from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import admin, assistant, auth, datasets, districts, incidents, reports, resources, risk, simulations
from app.core.config import settings
from sqlalchemy import text

from app.core.database import Base, engine

@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)  # use Alembic migrations for production schema changes
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
    return {"status": "ok", "database": "ok", "version": app.version}
