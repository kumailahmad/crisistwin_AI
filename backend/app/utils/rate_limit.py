import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException

from app.core.config import settings
from app.core.permissions import get_current_user
from app.models import User

_hits: dict[int, deque] = defaultdict(deque)


def ai_rate_limit(user: User = Depends(get_current_user)) -> User:
    q, t = _hits[user.id], time.monotonic()
    while q and t - q[0] > 60:
        q.popleft()
    if len(q) >= settings.ai_rate_limit_per_minute:
        raise HTTPException(429, "Too many assistant requests. Try again in a minute.")
    q.append(t)
    return user


# Brute-force protection for login: max 5 failures per (client ip, email) in a 5-minute window.
_fails: dict[str, deque] = defaultdict(deque)
LOGIN_MAX_FAILS, LOGIN_WINDOW = 5, 300


def _key(ip: str, email: str) -> str:
    return f"{ip}|{email.lower()}"


def login_blocked(ip: str, email: str) -> bool:
    q, t = _fails[_key(ip, email)], time.monotonic()
    while q and t - q[0] > LOGIN_WINDOW:
        q.popleft()
    if not q:
        _fails.pop(_key(ip, email), None)
        return False
    return len(q) >= LOGIN_MAX_FAILS


def login_failed(ip: str, email: str) -> None:
    _fails[_key(ip, email)].append(time.monotonic())


def login_ok(ip: str, email: str) -> None:
    _fails.pop(_key(ip, email), None)
