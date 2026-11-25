import pytest

from app.core.config import settings
from app.models import User
from app.services import gemini_service, risk_engine

V1 = "/api/v1"
FULL = {"rainfall_mm_24h": 100, "elevation_m": 500, "slope_deg": 3, "flood_history_index": 0.8, "exposure_index": 0.6}


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_register_hashes_password_and_rejects_duplicates(client, db):
    r = client.post(f"{V1}/auth/register", json={"email": "x@example.com", "password": "password123"})
    assert r.status_code == 201 and r.json()["role"] == "user"
    user = db.query(User).filter_by(email="x@example.com").one()
    assert user.hashed_password != "password123" and user.hashed_password.startswith("$2")
    assert client.post(f"{V1}/auth/register", json={"email": "x@example.com", "password": "password123"}).status_code == 409


def test_register_cannot_choose_admin_role(client):
    r = client.post(f"{V1}/auth/register", json={"email": "y@example.com", "password": "password123", "role": "admin"})
    assert r.json()["role"] == "user"


def test_login_failure_and_protected_routes(client, user_h):
    assert client.post(f"{V1}/auth/login", json={"email": "u@example.com", "password": "wrongpass1"}).status_code == 401
    assert client.get(f"{V1}/districts").status_code == 401
    assert client.get(f"{V1}/districts", headers={"Authorization": "Bearer junk"}).status_code == 401
    assert client.get(f"{V1}/auth/me", headers=user_h).json()["email"] == "u@example.com"


def test_districts_and_missing_boundary(client, user_h, district):
    assert client.get(f"{V1}/districts", headers=user_h).json()[0]["name"] == "Test District"
    assert client.get(f"{V1}/districts/999", headers=user_h).status_code == 404
    r = client.get(f"{V1}/districts/{district.id}/boundary", headers=user_h)
    assert r.status_code == 404


def test_admin_only_operations(client, user_h, admin_h):
    body = {"name": "New District"}
    assert client.post(f"{V1}/districts", json=body, headers=user_h).status_code == 403
    assert client.post(f"{V1}/districts", json=body, headers=admin_h).status_code == 201
    assert client.get(f"{V1}/admin/users", headers=user_h).status_code == 403
    logs = client.get(f"{V1}/admin/audit-logs", headers=admin_h).json()
    assert any(entry["action"] == "create" and entry["entity"] == "district" for entry in logs)


def test_boundary_validation(client, admin_h, district):
    url = f"{V1}/districts/{district.id}/boundary"
    ring = [[66, 30], [67, 30], [67, 31], [66, 31], [66, 30]]
    ok = client.put(url, json={"geometry": {"type": "Polygon", "coordinates": [ring]}, "source": "unit test"}, headers=admin_h)
    assert ok.status_code == 204
    assert client.get(url, headers=admin_h).json()["geometry"]["type"] == "Polygon"
    far = [[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]
    assert client.put(url, json={"geometry": {"type": "Polygon", "coordinates": [far]}, "source": "unit test"}, headers=admin_h).status_code == 422
    assert client.put(url, json={"geometry": {"type": "Point", "coordinates": [66, 30]}, "source": "unit test"}, headers=admin_h).status_code == 422


def test_risk_engine_full_inputs():
    r = risk_engine.assess(FULL, {"rainfall_mm_24h": "measured"})
    assert r["score"] is not None and 0 <= r["score"] <= 100 and r["coverage"] == 1.0
    assert r["missing"] == []
    assert {f["status"] for f in r["factors"]} >= {"measured", "unspecified"}


def test_risk_engine_missing_data_is_not_zero_risk():
    partial = {k: v for k, v in FULL.items() if k != "exposure_index"}
    r = risk_engine.assess(partial)
    assert r["missing"] == ["exposure_index"] and r["coverage"] < 1
    zeroed = risk_engine.assess({**partial, "exposure_index": 0})
    assert r["score"] != zeroed["score"]
    assert "missing" in r["explanation"]


def test_risk_engine_refuses_when_too_little_data():
    r = risk_engine.assess({"exposure_index": 0.5})
    assert r["score"] is None and r["category"] == "Insufficient data"


def test_risk_endpoint_validation_and_ownership(client, user_h, admin_h, district):
    r = client.post(f"{V1}/risk/assess", json={"district_id": district.id, **FULL}, headers=user_h)
    assert r.status_code == 201
    aid = r.json()["id"]
    assert client.post(f"{V1}/risk/assess", json={"district_id": district.id, "slope_deg": 400}, headers=user_h).status_code == 422
    assert client.post(f"{V1}/risk/assess", json={"district_id": 999, **FULL}, headers=user_h).status_code == 404
    client.post(f"{V1}/auth/register", json={"email": "o@example.com", "password": "password123"})
    other = {"Authorization": "Bearer " + client.post(f"{V1}/auth/login", json={"email": "o@example.com", "password": "password123"}).json()["access_token"]}
    assert client.get(f"{V1}/risk/assessments/{aid}", headers=other).status_code == 404
    assert client.get(f"{V1}/risk/assessments/{aid}", headers=admin_h).status_code == 200


def test_simulation_flow(client, user_h, district):
    body = {"district_id": district.id, "rainfall_intensity_mm_h": 30, "duration_h": 6, "elevation_m": 400}
    r = client.post(f"{V1}/simulations", json=body, headers=user_h)
    assert r.status_code == 201 and r.json()["status"] == "completed"
    sid = r.json()["id"]
    res = client.get(f"{V1}/simulations/{sid}/results", headers=user_h).json()["results"]
    assert res["total_rainfall_mm"] == 180 and res["limitations"] and res["assumptions"]
    assert res["visualization"] is None and "boundary" in res["visualization_note"]
    assert any("not a hydrological" in x for x in res["limitations"])


@pytest.mark.parametrize("bad", [{"rainfall_intensity_mm_h": 0, "duration_h": 5}, {"rainfall_intensity_mm_h": 20, "duration_h": 1000},
                                 {"rainfall_intensity_mm_h": -5, "duration_h": 5}, {"duration_h": 5}])
def test_simulation_validation(client, user_h, district, bad):
    assert client.post(f"{V1}/simulations", json={"district_id": district.id, **bad}, headers=user_h).status_code == 422


def test_simulation_pdf(client, user_h, district):
    sid = client.post(f"{V1}/simulations", json={"district_id": district.id, "rainfall_intensity_mm_h": 20, "duration_h": 4, "elevation_m": 900}, headers=user_h).json()["id"]
    r = client.get(f"{V1}/reports/simulations/{sid}/pdf", headers=user_h)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")


RES = {"name": "Test Hospital", "type": "hospital", "latitude": 30.2, "longitude": 67.0, "source": "unit test"}


def test_resources_crud_permissions(client, user_h, admin_h):
    assert client.post(f"{V1}/resources", json=RES, headers=user_h).status_code == 403
    rid = client.post(f"{V1}/resources", json=RES, headers=admin_h).json()["id"]
    assert client.get(f"{V1}/resources?type=hospital&q=test", headers=user_h).json()[0]["id"] == rid
    assert client.put(f"{V1}/resources/{rid}", json={**RES, "name": "Renamed"}, headers=user_h).status_code == 403
    assert client.put(f"{V1}/resources/{rid}", json={**RES, "name": "Renamed"}, headers=admin_h).json()["name"] == "Renamed"
    assert client.delete(f"{V1}/resources/{rid}", headers=user_h).status_code == 403
    assert client.delete(f"{V1}/resources/{rid}", headers=admin_h).status_code == 204
    assert client.get(f"{V1}/resources/{rid}", headers=user_h).status_code == 404


@pytest.mark.parametrize("coords", [{"latitude": 95, "longitude": 67}, {"latitude": 30, "longitude": 200},
                                    {"latitude": 51.5, "longitude": -0.1}])
def test_resource_invalid_coordinates(client, admin_h, coords):
    assert client.post(f"{V1}/resources", json={**RES, **coords}, headers=admin_h).status_code == 422


def test_assistant_not_configured(client, user_h, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", None)
    monkeypatch.setattr(settings, "groq_api_key", None)
    r = client.post(f"{V1}/assistant/chat", json={"message": "hello"}, headers=user_h)
    assert r.status_code == 503


def test_assistant_provider_failure(client, user_h, monkeypatch):
    def boom(prompt):
        raise gemini_service.AIFailure("down")
    monkeypatch.setattr(gemini_service, "call_ai", boom)
    assert client.post(f"{V1}/assistant/chat", json={"message": "hello"}, headers=user_h).status_code == 502


def test_assistant_success_passes_db_context(client, user_h, district, monkeypatch):
    seen = {}
    monkeypatch.setattr(gemini_service, "call_ai", lambda p: seen.update(prompt=p) or "ok reply")
    r = client.post(f"{V1}/assistant/chat", json={"message": "Explain", "district_id": district.id, "language": "ur"}, headers=user_h)
    assert r.status_code == 200 and r.json()["reply"] == "ok reply"
    assert "Test District" in seen["prompt"] and r.json()["disclaimer"]


def test_assistant_rate_limit(client, user_h, monkeypatch):
    monkeypatch.setattr(settings, "ai_rate_limit_per_minute", 2)
    monkeypatch.setattr(gemini_service, "call_ai", lambda p: "ok")
    codes = [client.post(f"{V1}/assistant/chat", json={"message": "hi"}, headers=user_h).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_reports_overview(client, user_h, district):
    assert client.get(f"{V1}/reports/overview", headers=user_h).json()["districts"] == 1
    assert client.get(f"{V1}/reports/risk", headers=user_h).json()["total"] == 0


def test_datasets_crud_admin_only(client, user_h, admin_h):
    body = {"name": "Natural Earth", "kind": "boundary", "source": "naturalearthdata.com"}
    assert client.post(f"{V1}/datasets", json=body, headers=user_h).status_code == 403
    r = client.post(f"{V1}/datasets", json=body, headers=admin_h)
    assert r.status_code == 201
    assert client.post(f"{V1}/datasets", json=body, headers=admin_h).status_code == 409
    assert len(client.get(f"{V1}/datasets", headers=user_h).json()) == 1
    assert client.delete(f"{V1}/datasets/{r.json()['id']}", headers=admin_h).status_code == 204


def test_all_boundaries_and_admin_stats(client, user_h, admin_h, district):
    ring = [[66, 30], [67, 30], [67, 31], [66, 31], [66, 30]]
    client.put(f"{V1}/districts/{district.id}/boundary", json={"geometry": {"type": "Polygon", "coordinates": [ring]}, "source": "unit test"}, headers=admin_h)
    fc = client.get(f"{V1}/districts/boundaries/all", headers=user_h).json()
    assert fc["type"] == "FeatureCollection" and len(fc["features"]) == 1
    assert client.get(f"{V1}/admin/stats", headers=user_h).status_code == 403
    st = client.get(f"{V1}/admin/stats", headers=admin_h).json()
    assert st["districts_with_boundary"] == 1 and st["users"] >= 2


def test_simulation_uses_peak_24h_rainfall():
    from app.services import simulation_engine
    out = simulation_engine.run({"rainfall_intensity_mm_h": 10, "duration_h": 72, "input_status": {}}, None)
    assert out["total_rainfall_mm"] == 720.0
    rain = next(f for f in out["risk_indicators"]["factors"] if f["name"] == "rainfall_mm_24h")
    assert rain["value"] == 240.0


def test_bulk_resources_all_or_nothing(client, user_h, admin_h, district):
    good = {"name": "Sample Clinic", "type": "hospital", "latitude": 30.2, "longitude": 67.0, "source": "unit test", "district_id": district.id}
    assert client.post(f"{V1}/resources/bulk", json={"items": [good]}, headers=user_h).status_code == 403
    bad = {**good, "name": "Far away", "latitude": 10, "longitude": 10}
    assert client.post(f"{V1}/resources/bulk", json={"items": [good, bad]}, headers=admin_h).status_code == 422
    assert client.get(f"{V1}/resources", headers=admin_h).json() == []
    assert client.post(f"{V1}/resources/bulk", json={"items": [good, {**good, "name": "Second"}]}, headers=admin_h).json() == {"created": 2}
    assert client.post(f"{V1}/resources/bulk", json={"items": [{**good, "district_id": 9999}]}, headers=admin_h).status_code == 422


def test_login_throttle_and_health(client, user_h):
    for _ in range(5):
        assert client.post(f"{V1}/auth/login", json={"email": "u@example.com", "password": "wrong-pass"}).status_code == 401
    assert client.post(f"{V1}/auth/login", json={"email": "u@example.com", "password": "wrong-pass"}).status_code == 429
    h = client.get("/health").json()
    assert h["status"] == "ok" and h["database"] == "ok"


def test_provider_selection_and_groq_request(monkeypatch):
    import httpx
    monkeypatch.setattr(settings, "ai_provider", "auto")
    monkeypatch.setattr(settings, "groq_api_key", "gsk_test")
    monkeypatch.setattr(settings, "gemini_api_key", "g-test")
    assert gemini_service.active_provider() == "groq"
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    assert gemini_service.active_provider() == "gemini"
    monkeypatch.setattr(settings, "ai_provider", "auto")
    seen = {}

    def fake_post(url, **kw):
        seen.update(url=url, **kw)
        return httpx.Response(200, json={"choices": [{"message": {"content": "hello"}}]}, request=httpx.Request("POST", url))
    monkeypatch.setattr(httpx, "post", fake_post)
    assert gemini_service.call_ai("hi") == "hello"
    assert seen["url"].startswith("https://api.groq.com/openai/v1/") and seen["headers"]["Authorization"] == "Bearer gsk_test"
    assert seen["json"]["messages"][1]["content"] == "hi"


def test_groq_http_error_becomes_ai_failure(monkeypatch):
    import httpx
    monkeypatch.setattr(settings, "groq_api_key", "gsk_test")
    monkeypatch.setattr(gemini_service.time, "sleep", lambda s: None)
    monkeypatch.setattr(httpx, "post", lambda url, **kw: httpx.Response(401, json={}, request=httpx.Request("POST", url)))
    import pytest
    with pytest.raises(gemini_service.AIFailure):
        gemini_service.call_ai("hi")


def test_contacts_directory_loaded_and_in_ai_context(client, user_h, district, monkeypatch):
    from app.services import contacts
    data = contacts.load()
    assert len(data["hospitals"]) == 65 and all(h["name"] for h in data["hospitals"])
    assert any(h["id"] == "police-15" and h["confidence"] == "official" for h in data["helplines"])
    assert not any(h["number"] == "1700" for h in data["helplines"])  # 1700 is the KP PDMA helpline, not Balochistan
    assert contacts.hospitals_in("quetta")
    seen = {}
    monkeypatch.setattr(gemini_service, "call_ai", lambda p: seen.update(prompt=p) or "ok")
    r = client.post(f"{V1}/assistant/chat", json={"message": "who to call?", "language": "en", "district_id": district.id}, headers=user_h)
    assert r.status_code == 200 and "official_helplines" in seen["prompt"] and "Police emergency" in seen["prompt"]


# ---- incident reports ----
import io as _io
from PIL import Image as _Img


def _img(fmt="JPEG", size=(2400, 1800), exif=False):
    b = _io.BytesIO()
    im = _Img.new("RGB", size, (120, 90, 60))
    kw = {}
    if exif and fmt == "JPEG":
        ex = _Img.Exif()
        ex[0x010F] = "SecretCam"
        kw["exif"] = ex
    im.save(b, fmt, **kw)
    return b.getvalue()


def _report(client, h, photos=(), **over):
    data = {"type": "flood", "severity": "high", "description": "Water is entering homes near the river bank.",
            "latitude": "30.18", "longitude": "67.01", "location_source": "gps", "accuracy_m": "12"}
    data.update(over)
    files = [("photos", (f"p{n}.jpg", p, "image/jpeg")) for n, p in enumerate(photos)]
    return client.post("/api/v1/incidents", data=data, files=files or None, headers=h)


def test_incident_submit_with_photo_strips_exif_and_resizes(client, user_h):
    r = _report(client, user_h, photos=[_img(exif=True)])
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["code"].startswith("CT-") and j["status"] == "pending" and j["photo_count"] == 1
    m = j["media"][0]
    assert max(m["width"], m["height"]) <= 1600
    blob = client.get(f"/api/v1/incidents/{j['id']}/media/{m['id']}", headers=user_h)
    assert blob.status_code == 200 and blob.headers["content-type"] == "image/jpeg"
    assert not _Img.open(_io.BytesIO(blob.content)).getexif()  # EXIF removed


def test_incident_rejects_bad_input(client, user_h):
    assert _report(client, user_h, latitude="10", longitude="10").status_code == 422      # outside Balochistan
    assert _report(client, user_h, description="short").status_code == 422
    assert _report(client, user_h, type="alien").status_code == 422
    assert _report(client, user_h, contact_phone="abc").status_code == 422
    assert _report(client, user_h, photos=[b"not an image"]).status_code == 422
    assert _report(client, user_h, photos=[_img(size=(50, 50))] * 5).status_code == 422   # too many
    gif = _io.BytesIO(); _Img.new("RGB", (9, 9)).save(gif, "GIF")
    assert _report(client, user_h, photos=[gif.getvalue()]).status_code == 422             # wrong format
    assert client.get("/api/v1/incidents/mine", headers=user_h).json() == []                # nothing partially saved


def test_incident_privacy_and_triage(client, user_h, admin_h):
    iid = _report(client, user_h, photos=[_img(size=(300, 200))]).json()["id"]
    client.post("/api/v1/auth/register", json={"email": "other@example.com", "password": "password123"})
    other = {"Authorization": "Bearer " + client.post("/api/v1/auth/login", json={"email": "other@example.com", "password": "password123"}).json()["access_token"]}
    assert client.get(f"/api/v1/incidents/{iid}", headers=other).status_code == 404
    assert client.get(f"/api/v1/incidents/{iid}/media/1", headers=other).status_code == 404
    assert client.get("/api/v1/incidents", headers=user_h).status_code == 403
    assert client.patch(f"/api/v1/incidents/{iid}", json={"status": "verified"}, headers=user_h).status_code == 403
    assert client.get("/api/v1/incidents/public", headers=other).json() == []              # pending is not public
    r = client.patch(f"/api/v1/incidents/{iid}", json={"status": "verified", "admin_note": "Confirmed by PDMA"}, headers=admin_h)
    assert r.status_code == 200 and r.json()["status"] == "verified"
    pub = client.get("/api/v1/incidents/public", headers=other).json()
    assert len(pub) == 1 and "contact_phone" not in pub[0] and "media" not in pub[0] and "user_id" not in pub[0]
    assert client.get("/api/v1/incidents/stats", headers=admin_h).json()["verified"] == 1
    assert client.delete(f"/api/v1/incidents/{iid}", headers=admin_h).status_code == 204


def test_incident_similar_nearby_and_district(client, user_h, db):
    from app.models import Boundary, District
    d = District(name="Testland"); db.add(d); db.commit()
    db.add(Boundary(district_id=d.id, source="t", geometry={"type": "Polygon", "coordinates": [[[66.9, 30.1], [67.1, 30.1], [67.1, 30.3], [66.9, 30.3], [66.9, 30.1]]]})); db.commit()
    a = _report(client, user_h).json()
    assert a["district_name"] == "Testland" and a["similar_nearby"] == 0
    b = _report(client, user_h, latitude="30.181", longitude="67.011").json()
    assert b["similar_nearby"] == 1


def test_database_url_normalised():
    from app.core.config import Settings
    assert Settings(database_url="postgres://u:p@h/db").database_url == "postgresql+psycopg://u:p@h/db"
    assert Settings(database_url="postgresql://u:p@h/db?sslmode=require").database_url.startswith("postgresql+psycopg://")
    assert Settings(database_url="sqlite:///./x.db").database_url == "sqlite:///./x.db"


def test_admin_autocreated_from_env(db, monkeypatch):
    from app.core import database
    from app.core.config import settings
    from app.main import _ensure_admin
    from app.models import User
    monkeypatch.setattr(settings, "admin_email", "Boss@Example.com")
    monkeypatch.setattr(settings, "admin_password", "a-long-secret-1")
    monkeypatch.setattr(database, "SessionLocal", lambda: db)
    _ensure_admin(); _ensure_admin()  # idempotent
    users = db.query(User).filter(User.email == "boss@example.com").all()
    assert len(users) == 1 and users[0].role == "admin"
