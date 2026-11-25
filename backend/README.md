# CrisisTwin AI backend (prototype)

FastAPI REST API for the CrisisTwin AI Balochistan disaster-management platform.
All risk and simulation outputs are heuristic prototype indicators, not verified flood predictions.

## Run locally
```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # set SECRET_KEY, DATABASE_URL, GEMINI_API_KEY
python -m app.create_admin admin@example.com 'a-strong-password'
uvicorn app.main:app --reload --port 8000
```
Docs: http://localhost:8000/docs  Health: http://localhost:8000/health
Without `DATABASE_URL` it uses a local SQLite file. Tests: `python -m pytest -q`.

## Endpoints (all under /api/v1, JWT bearer required except register/login)
auth: register, login, me | districts: list, get, boundary, create (admin), PUT boundary (admin)
risk: assess, assessments, assessments/{id} | simulations: create, list, get, results
resources: CRUD (writes admin-only) | assistant/chat (rate limited) | reports: overview, risk, simulations/{id}/pdf
admin: users, PATCH users/{id}, audit-logs

## Data rules
No districts, boundaries or resources are seeded. Add verified records through the admin endpoints with a `source`.
Missing risk inputs are excluded and reported, never counted as zero; below 50% factor-weight coverage no score is produced.

## Known gaps
- Geometry is stored as GeoJSON (JSON column), validated with Shapely. PostGIS geometry columns, spatial SQL queries,
  GeoPandas/Rasterio terrain ingestion and Alembic migrations are not implemented yet (tables are created at startup).
- Simulations are indicator-based, not hydrological/hydraulic inundation models.
- Gemini is called over REST and was only tested with the provider mocked, not against the live API.
- Rate limiting is in-memory (single process). Deploy: set APP_ENV=production, a real SECRET_KEY, restrict CORS_ORIGINS,
  run `uvicorn app.main:app --host 0.0.0.0 --port 8000` behind HTTPS.
