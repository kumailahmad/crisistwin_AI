# CrisisTwin AI (Balochistan): backend + frontend

Academic / innovation-expo prototype. All risk scores and simulations are heuristic indicators, **not** verified flood predictions.

## Run it
```bash
# 1. Backend (Python 3.12+)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                                   # set SECRET_KEY and GROQ_API_KEY (or GEMINI_API_KEY)
python -m app.import_boundaries districts.geojson      # loads 26 real district boundaries (unverified)
python -m app.create_admin admin@example.com 'a-strong-password'
uvicorn app.main:app --reload --port 8000              # docs: http://localhost:8000/docs

# 2. Frontend (Node 20+)
cd ../frontend
cp .env.local.example .env.local                       # NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
npm install && npm run dev                             # http://localhost:3000
```
Production: `npm run build && npm start`. Tests: `cd backend && python -m pytest -q` (31 tests).

**Docker (PostgreSQL + API + web):** `SECRET_KEY=$(openssl rand -hex 32) docker compose up --build` (compose/Dockerfiles are provided but were not run in the build sandbox).
Browser E2E scripts (Playwright + Chrome) are in `e2e-tests/`.

## What's in the app
Landing · Login (user/admin, register, demo mode) · Dashboard · GIS map · Risk assessment · Simulations ·
Emergency resources (admins: single add, **bulk CSV import** with preview and all-or-nothing validation) · AI assistant (EN/اردو) · Reports (+PDF) · Admin: overview & readiness checklist, districts
(incl. one-click open-data boundary import + GeoJSON upload), datasets, resources, scenarios, users, audit logs.

## Speed & usability
Charts are lazy-loaded (first-load JS cut by ~100 kB on dashboard/reports/admin) · pages show the last loaded data instantly and refresh in the background · `Ctrl/Cmd + K` quick search for pages and districts · district name labels on the map when zoomed in · skip-to-content link and reduced-motion support.

## Reliability
Login brute-force throttle (5 failures / 5 min per IP+email) · `/health` checks the database · API client has a 20 s timeout and one retry for reads · “server unreachable” banner · section-level error screen that keeps the menu · error, 404 and loading screens · all-or-nothing bulk import · audit log of admin actions.

## Maps
Base maps: Esri satellite (+labels hybrid), OpenStreetMap streets, OpenTopoMap terrain, CARTO dark; optional RainViewer
observed-radar overlay. District boundaries come from **geoBoundaries gbOpen PAK ADM2 (CC BY 4.0)**, filtered to
Balochistan and simplified. They are imported as *unverified*; an admin marks them verified after review.

## Demo mode
"Continue in demo mode" needs no backend: real boundaries, risk/simulation computed in the browser (labelled), no
invented facilities or statistics. Admin pages, assistant and PDF export need the backend.

## Known limitations
- Boundary set has 26 districts (geoBoundaries' older division). Newer districts (e.g. Chaman, Hub, Duki, Surab, Washuk, Sherani, Harnai) are not included; upload them via Admin → Districts.
- Tile layers load from third-party servers in the browser and need internet; the build environment had none, so base-map imagery was not visually verified here (boundaries, controls and layers were).
- No PostGIS / GeoPandas / Rasterio / Alembic yet (geometry stored as GeoJSON JSON; tables created at startup).
- No Three.js 3D terrain view. Simulations are indicator-based, not hydraulic inundation models.
- AI providers (Groq, Gemini) are tested with the HTTP call mocked, not against the live services. Rate limiting is in-memory (single process).
- No emergency resources are bundled: add verified records in Admin → Resources.


## Emergency contacts, place search and AI (added)

- **/emergency page**: 6 helplines (each labelled official / secondary / unconfirmed / outdated, with source link) and a 65-facility government hospital directory from the Balochistan Health Department PDF (28 Oct 2025). Data: `backend/app/data/emergency_contacts.json` (copy in `frontend/public/data/`). Numbers were copied from sources and NOT verified by calling.
- **Place search (cities, roads, streets)**: map search box uses OpenStreetMap Nominatim, restricted to Pakistan / Balochistan viewbox. Results are not stored in the database.
- **AI**: set `GROQ_API_KEY` (and optionally `GROQ_MODEL`) in `backend/.env`; `AI_PROVIDER=auto` prefers Groq, falls back to Gemini. The assistant may quote phone numbers only from the directory above.
- **Known limits**: 26 bundled district boundaries (older division; Balochistan reportedly has 41 districts since July 2026); hospital list has no coordinates; 1700 is the Khyber Pakhtunkhwa PDMA line, not Balochistan's.


## Report a crisis (incident reports)

- **User flow** (`/report`): choose type + severity, describe, set location by **live GPS** (keeps the best fix for up to 12 s, needs https on phones), **search** a place, or **tap/drag a pin**; attach up to 4 photos (camera or gallery), submit, get a reference code (`CT-YYMMDD-XXXX`) and track status under "Your reports".
- **Evidence handling**: photos are shrunk in the browser, then re-validated and re-encoded server-side with Pillow (JPEG/PNG/WebP only, 8 MB max, EXIF/GPS metadata removed, decompression-bomb guard) and stored in the DB. Only the reporter and admins can view them.
- **Admin triage** (`/admin/incidents`): review details, photos, location accuracy, reporter phone; Verify / Reject / Resolve with a note; delete. All actions are audit-logged. Only **verified/resolved** reports appear on the shared map, without reporter details or photos.
- **Reliability**: all-or-nothing validation (nothing saved if a photo is bad), 8 reports/hour/user limit, location must be inside Balochistan, district auto-detected from boundaries, nearby similar reports in the last 24 h are counted as corroboration.
- Demo mode stores reports in the browser only and says so.
- Limits: reports are not proof; verification is manual. Photos in the DB suit prototype scale; move to object storage for production.

## Theme
Balochistan dusk-and-ridgeline look (generated SVG mountains, contour texture, sand/amber accents) on the landing, login and dashboard.


## Deploying the API on Vercel
Vercel's disk is read-only, so SQLite fails with `unable to open database file`. Use a hosted PostgreSQL:
1. Create a free database (Neon, Supabase or Vercel Postgres) and copy its connection string.
2. In Vercel > Project > Settings > Environment Variables set `DATABASE_URL` (`postgresql://…?sslmode=require`), `SECRET_KEY`, `APP_ENV=production`, `CORS_ORIGINS=["https://<your-frontend>.vercel.app"]`, and `GROQ_API_KEY`. Redeploy.
3. Create the admin once from your computer: `DATABASE_URL=... python -m app.create_admin you@example.com StrongPass` (and optionally `python -m app.import_boundaries`).
4. Set `NEXT_PUBLIC_API_URL=https://<your-api>.vercel.app/api/v1` on the frontend project and redeploy it.
5. Check `https://<your-api>.vercel.app/health` shows `"database":"ok"`.

### Supabase as the database
Use **Project Settings > Database > Connection string > Transaction pooler** (host `aws-0-<region>.pooler.supabase.com`, port `6543`, user `postgres.<project-ref>`). Do not use the "Direct connection" (`db.<ref>.supabase.co`): it is IPv6-only and Vercel cannot reach it. URL-encode special characters in the password (`@` becomes `%40`).

## Private admin sign-in
Administrators sign in at **`/staff-access`** (not linked anywhere, `noindex`, listed as Disallow in `robots.txt`). The public `/login` has no admin option and answers "Incorrect email or password" for admin accounts. Normal users who open `/admin` are sent to the dashboard. The URL is only obscurity: real protection is the server-side role check, bcrypt passwords and login throttling (5 failures / 5 min). To change the URL, rename `frontend/src/app/staff-access`. Use a strong admin password.

### Admin without running commands
Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (10+ characters) in the backend's environment variables (e.g. Vercel). The administrator is created automatically on the next start; an existing account's password is never overwritten. After the first successful sign-in you may delete `ADMIN_PASSWORD` from the environment.

## Multi-Platform Ecosystem, PWA & Android Packaging

- **Unified API & OpenAPI Docs**: All web, PWA, and mobile experiences share the unified REST backend at `/api/v1/*` with `HttpOnly` cookie sessions (`SameSite=Lax` on HTTP localhost, `SameSite=None; Secure; Partitioned` on HTTPS) and CSRF origin validation. Inspect `/api/v1/openapi.json` for the live OpenAPI 3.1 schema.
- **Admin Command Center (`/admin/*`)**: Separate operational sidebar covering Overview, Incident Management (triage, team assignment, duplicate linking, timeline history, citizen flags), Disaster Monitoring Map (`/admin/monitoring`), Public Alerts (`/admin/alerts`), Emergency Resources (`hospital`, `shelter`, `rescue_center`, `fire_service`, `ambulance`, capacity, availability), AI Control (`/admin/ai`), Districts, Datasets, Simulations (side-by-side comparison & CSV/PDF), Analytics (`/reports`), Users (search & one-time reset codes), Audit Logs, and System Settings (`/admin/settings`).
- **Citizen App**: Dedicated citizen navigation & mobile bottom tab bar (`Home`, `Map`, `Report`, `Alerts`), `/alerts`, `/notifications` with header unread badge, `/profile` (home district, notification preferences, approximate-location privacy toggle, password change, account deletion), offline incident draft queue in `/report`, nearest-first geolocation sorting in `/resources`, and English / Urdu / Balochi (`en`/`ur`/`bal`) AI assistant grounded in stored records.
- **PWA & Capacitor Android APK**:
  - Includes Next.js App Router `manifest.ts` (`/manifest.webmanifest`), PNG icons (`192x192`, `512x512`, padded maskable `512x512`, `180x180` Apple touch icon), `public/sw.js`, `/offline` fallback, and install prompt banner/button.
  - To wrap as a native Android APK with Capacitor (`frontend/capacitor.config.ts`):
    ```bash
    cd frontend
    npm install @capacitor/core @capacitor/cli @capacitor/android
    npx cap add android
    # Point CAPACITOR_SERVER_URL to your deployed HTTPS CrisisTwin URL (or bundle static assets)
    CAPACITOR_SERVER_URL=https://crisistwin-ai.vercel.app npx cap sync android
    npx cap open android
    ```
