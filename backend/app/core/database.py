from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import ON_VERCEL, settings

if settings.database_url.startswith("sqlite"):
    _args = {"check_same_thread": False}
else:
    # Supabase / pgbouncer transaction pooler (port 6543) does not support server-side prepared statements.
    _args = {"prepare_threshold": None, "connect_timeout": 10}
# Serverless functions should not keep connections open between invocations (use the provider's pooled URL).
_kw = {"poolclass": NullPool} if ON_VERCEL and not settings.database_url.startswith("sqlite") else {"pool_pre_ping": True}
engine = create_engine(settings.database_url, connect_args=_args, **_kw)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
