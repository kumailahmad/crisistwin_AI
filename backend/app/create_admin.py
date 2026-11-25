"""Create or promote an administrator: python -m app.create_admin EMAIL PASSWORD"""
import sys

from sqlalchemy import select

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import User

if __name__ == "__main__":
    email, password = sys.argv[1].lower(), sys.argv[2]
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == email))
        if u:
            u.role = "admin"
        else:
            db.add(User(email=email, hashed_password=hash_password(password), role="admin"))
        db.commit()
    print(f"Admin ready: {email}")
