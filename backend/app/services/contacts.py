"""Sourced emergency-contact directory (see app/data/emergency_contacts.json). Read-only reference data."""
import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "emergency_contacts.json"


@lru_cache
def load() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def helplines_for_ai() -> list[dict]:
    return [{"name": h["name"], "number": h["number"], "confidence": h["confidence"], "note": h["note"]} for h in load()["helplines"]]


def hospitals_in(district_name: str) -> list[dict]:
    key = district_name.strip().lower()
    return [{"name": h["name"], "phone": h["phone"]} for h in load()["hospitals"] if h["district"].lower() == key]
