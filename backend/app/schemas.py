from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.config import settings

InputStatus = Literal["measured", "estimate", "assumption"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str | None = Field(default=None, max_length=120)

    @field_validator("password")
    @classmethod
    def _bcrypt_limit(cls, v: str) -> str:
        if len(v.encode()) > 72:
            raise ValueError("Password must be at most 72 bytes")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(ORM):
    id: int
    email: str
    full_name: str | None
    role: str
    is_active: bool


class UserUpdate(BaseModel):
    role: Literal["user", "admin"] | None = None
    is_active: bool | None = None


class DistrictIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    area_km2: float | None = Field(default=None, gt=0)
    population: int | None = Field(default=None, ge=0)
    data_source: str | None = None
    verified: bool = False


class DistrictOut(ORM):
    id: int
    name: str
    province: str
    area_km2: float | None
    population: int | None
    data_source: str | None
    verified: bool
    has_boundary: bool = False


class BoundaryIn(BaseModel):
    geometry: dict[str, Any]
    source: str = Field(min_length=3)


class RiskIn(BaseModel):
    district_id: int
    rainfall_mm_24h: float | None = Field(default=None, ge=0, le=1000)
    elevation_m: float | None = Field(default=None, ge=-100, le=9000)
    slope_deg: float | None = Field(default=None, ge=0, le=90)
    flood_history_index: float | None = Field(default=None, ge=0, le=1)
    exposure_index: float | None = Field(default=None, ge=0, le=1)
    input_status: dict[str, InputStatus] = {}


class RiskOut(ORM):
    id: int
    district_id: int
    inputs: dict
    result: dict
    score: float | None
    category: str
    created_at: datetime


class SimulationIn(BaseModel):
    district_id: int
    rainfall_intensity_mm_h: float = Field(gt=0, le=300)
    duration_h: float = Field(gt=0, le=168)
    elevation_m: float | None = Field(default=None, ge=-100, le=9000)
    slope_deg: float | None = Field(default=None, ge=0, le=90)
    flood_history_index: float | None = Field(default=None, ge=0, le=1)
    exposure_index: float | None = Field(default=None, ge=0, le=1)
    input_status: dict[str, InputStatus] = {}


class SimulationOut(ORM):
    id: int
    district_id: int
    params: dict
    status: str
    created_at: datetime


class SimulationDetail(SimulationOut):
    results: dict | None


class ResourceIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    type: Literal["hospital", "shelter", "rescue_center", "other"]
    district_id: int | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    phone: str | None = Field(default=None, max_length=40)
    address: str | None = None
    source: str = Field(min_length=3)
    verified: bool = False

    @field_validator("longitude")
    @classmethod
    def _lon_bbox(cls, v: float, info) -> float:
        lat = info.data.get("latitude")
        if lat is not None and not (
            settings.bbox_min_lat <= lat <= settings.bbox_max_lat and settings.bbox_min_lon <= v <= settings.bbox_max_lon
        ):
            raise ValueError("Coordinates fall outside the Balochistan study area")
        return v


class ResourceOut(ORM):
    id: int
    name: str
    type: str
    district_id: int | None
    latitude: float
    longitude: float
    phone: str | None
    address: str | None
    source: str
    verified: bool


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    language: Literal["en", "ur"] = "en"
    district_id: int | None = None
    simulation_id: int | None = None
    assessment_id: int | None = None


class ChatOut(BaseModel):
    reply: str
    language: str
    context_used: dict
    disclaimer: str


class DatasetIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    kind: str = Field(min_length=2, max_length=40)
    source: str = Field(min_length=3, max_length=255)
    description: str | None = None
    verified: bool = False


class DatasetOut(ORM):
    id: int
    name: str
    kind: str
    source: str
    description: str | None
    verified: bool
    created_at: datetime


class DistrictUpdate(BaseModel):
    area_km2: float | None = Field(default=None, gt=0)
    population: int | None = Field(default=None, ge=0)
    data_source: str | None = None
    verified: bool | None = None


class ResourceBulkIn(BaseModel):
    items: list[ResourceIn] = Field(min_length=1, max_length=500)
