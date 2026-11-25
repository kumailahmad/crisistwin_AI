"""Helpers for incident reports: image sanitising, district lookup, reference codes, proximity."""
import hashlib
import io
import math
import secrets
from datetime import datetime, timezone

from PIL import Image, ImageOps, UnidentifiedImageError
from shapely.geometry import Point, shape
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Boundary

TYPES = ("flood", "heavy_rain", "earthquake", "landslide", "drought", "fire", "road_blocked", "medical", "missing_person", "other")
MAX_PHOTOS = 4
MAX_RAW_BYTES = 8 * 1024 * 1024
MAX_EDGE = 1600
Image.MAX_IMAGE_PIXELS = 60_000_000  # guards against decompression bombs


class BadImage(ValueError):
    pass


def sanitize_image(raw: bytes) -> dict:
    """Decode, fix orientation, drop EXIF/metadata, downscale and re-encode as JPEG."""
    if len(raw) > MAX_RAW_BYTES:
        raise BadImage("Photo is larger than 8 MB")
    try:
        with Image.open(io.BytesIO(raw)) as im:
            if im.format not in ("JPEG", "PNG", "WEBP"):
                raise BadImage("Only JPEG, PNG or WebP photos are accepted")
            im = ImageOps.exif_transpose(im)
            if im.mode not in ("RGB",):
                bg = Image.new("RGB", im.size, (255, 255, 255))
                im = im.convert("RGBA")
                bg.paste(im, mask=im.split()[-1])
                im = bg
            im.thumbnail((MAX_EDGE, MAX_EDGE))
            out = io.BytesIO()
            im.save(out, "JPEG", quality=82, optimize=True)  # new file => no EXIF/GPS carried over
            data = out.getvalue()
            return {"data": data, "width": im.width, "height": im.height, "size": len(data),
                    "sha256": hashlib.sha256(data).hexdigest(), "content_type": "image/jpeg"}
    except BadImage:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError) as exc:
        raise BadImage("File is not a valid image") from exc


def new_code(db: Session) -> str:
    from app.models import Incident
    for _ in range(10):
        code = f"CT-{datetime.now(timezone.utc):%y%m%d}-{secrets.token_hex(2).upper()}"
        if not db.scalar(select(Incident.id).where(Incident.code == code)):
            return code
    return f"CT-{secrets.token_hex(6).upper()}"


def district_at(db: Session, lat: float, lon: float) -> int | None:
    pt = Point(lon, lat)
    for b in db.scalars(select(Boundary)):
        try:
            if shape(b.geometry).buffer(0).contains(pt):
                return b.district_id
        except Exception:
            continue
    return None


def km_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))
