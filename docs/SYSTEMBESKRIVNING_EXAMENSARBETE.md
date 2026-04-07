# Dogtracks Geofence Kit – systembeskrivning (examensarbete)

**Syfte med detta dokument:** En samlad, kopieringsbar beskrivning av hela systemet: tekniker, databas, API:er, ML, drift och hjälpverktyg.  
**Uppdateringsunderlag:** `backend/main.py` (alla routes), `requirements.txt` (rot + `backend/requirements.txt` + `ml/requirements.txt`), `frontend/package.json`, `Dockerfile`, `.github/workflows/`, `.gitattributes`, `docs/`, `ml/`, `backend/scripts/`, `tools/`, `frontend/src/utils/`, `archive/`.

**Senast genomgången mot kodbas:** 2026-04-05 (API-lista verifierad med `grep` av `@app`-routes i `main.py`). Vid större refaktorering: kör samma `grep` eller öppna `/docs` på en körande backend.

---

## 0. Ändringar och tillägg efter första versionen av denna fil

Följande har lagts till eller förbättrats i kodbasen och ska beaktas tillsammans med resten av dokumentet:

| Område | Vad som gjorts |
|--------|----------------|
| **CORS** | `allow_methods` inkluderar **`PATCH`** – behövs för `PATCH /tracks/{id}` (t.ex. `human_track_id`) från annan origin (Railway frontend ↔ backend). |
| **ML batch-generering** | `POST /ml/experiments/batch/generate`: **`HTTPException` re-raises** (så 404 för saknad modell inte blir 500); **`finally`** stänger DB-anslutning; vid **Git LFS-pekare** i `.pkl` → **503** med förklaring. |
| **Experimentläge (frontend)** | Vid fel-svar (4xx/5xx) visas **`detail`** från FastAPI i alert (t.ex. LFS-meddelande vid 503). |
| **Testmiljö – spara koppling** | Efter lyckad `PATCH` uppdateras state från **samma svar**; `loadTracks()` körs i **bakgrunden** (`void`) så knappen inte låses under tung `GET /tracks`. |
| **Karttiles (OSM)** | `frontend/src/utils/osmTileLayer.js` kapslar in Leaflet tile layer och **begränsar zoom i tile-URL** (publika OSM-tiles ~z19) för att undvika HTTP 400. |
| **Spårlista (frontend)** | `frontend/src/utils/tracksApi.js` – **`normalizeTracksListResponse`**: om `/tracks` returnerar HTML (felkonfigurerad `VITE_API_URL`) fås tydlig varning istället för tyst tom lista. |
| **CI / Docker-image** | `.github/workflows/build-push-ghcr.yml`: **`lfs: true`** vid checkout; **verifieringssteg** att `gps_correction_model_best.pkl` och `gps_correction_scaler.pkl` inte är LFS-textpekare innan `docker build`. |
| **Git LFS** | **`.gitattributes`**: `*.pkl` spåras med LFS – stora modeller; kräver korrekt fetch vid build/deploy. |

---

## 1. Produktöversikt

**Dogtracks Geofence Kit** är ett webbaserat system som:

- hanterar **geofences** (cirkel/polygon) och utvärderar om positioner ligger inne/ute;
- lagrar **GPS-spår** för **människa** och **hund**, med valfri koppling `human_track_id` (hund → människa);
- stöder **annotering** och **korrigering** av positioner, **truth levels** (T0–T3) och **verified_status**;
- kör **maskininlärningsbaserad GPS-korrigering** (träning offline, inferens via REST API);
- har **experimentläge** för att generera och **bedöma** ML-korrigeringar på importerade kundspår (`track_source = imported`);
- kan jämföra spår (**punkt**, **segment**, **DTW**);
- kan visa **högupplösta lokala karttiles** om dessa finns i backend.

**Ingen fullständig inbyggd användarautentisering** i produktionsläget (API är i praktiken öppet för den som når URL:en) – viktigt att nämna i säkerhetsdiskussion.

---

## 2. Arkitektur (tre lager + ML-artefakter)

| Lager | Teknik | Funktion |
|--------|--------|----------|
| **Klient** | React 18, Vite 5, Tailwind CSS, PostCSS, Autoprefixer, Leaflet 1.9, Axios | SPA, karta, HTTP mot API |
| **API** | FastAPI, Uvicorn (ASGI), Pydantic v2, Starlette CORS | REST, JSON, validering, OpenAPI `/docs` |
| **Databas** | PostgreSQL (produktion) / SQLite (lokal utveckling) | Relationsdata |
| **ML offline** | Python, NumPy, pandas, scikit-learn, (valfritt) XGBoost, matplotlib, seaborn, (valfritt) scipy, joblib, Jupyter | Träning, analys, `.pkl` + JSON i `ml/output/` |
| **Drift** | Docker, GitHub Actions → GHCR, Railway (ev. Render enligt `render.yaml`), Git LFS för stora `.pkl` | Bygg, deploy, modellfiler |

**Miljövariabler (urval):** `DATABASE_URL` / `DATABASE_PUBLIC_URL` / `POSTGRES_URL`, `PORT`, `ENV`, `VITE_API_URL` (frontend).

---

## 3. Kodbasens struktur (högnivå)

```
GPSmcguffin/
├── backend/           # FastAPI (main.py), run.py, pipelines/, utils/, scripts/
├── frontend/          # React + Vite + Tailwind + Leaflet
├── ml/                  # analysis.py, data/, output/, predictions/, train_only.py, guider (*.md)
├── tools/               # tile_converter.py (karttiles)
├── docs/                # API, experiment, pipelines, denna fil, m.m.
├── archive/             # Railway-guider, äldre planer
├── Dockerfile           # Python 3.11-slim, kopierar backend + ml
├── requirements.txt     # Rot: FastAPI + ML (pandas, matplotlib, seaborn, sklearn …) – används i Dockerfile
├── backend/requirements.txt  # Smalare: FastAPI, uvicorn, pydantic, psycopg2, pillow, requests, numpy, python-dotenv (saknar t.ex. scikit-learn som rot-`requirements.txt` har för ML i API)
├── ml/requirements.txt  # Extra för ren ML-träning (xgboost, jupyter, scipy …)
├── .gitattributes       # Git LFS för *.pkl
├── .github/workflows/   # CI: build-push-ghcr.yml
└── render.yaml          # Exempelkonfiguration Render (web + Python)
```

---

## 4. Frontend – tekniker och beteenden

| Teknik | Användning |
|--------|------------|
| **React 18** | Komponenter, state, `useEffect`/`useMemo`/`useRef` |
| **Vite 5** | Dev-server, `npm run build`, `import.meta.env.VITE_API_URL` |
| **@vitejs/plugin-react** | JSX/TSX-transform |
| **Tailwind CSS 3** | Utility-first styling |
| **PostCSS + Autoprefixer** | CSS-pipeline |
| **Leaflet 1.9** | Kartor, tile layers (OSM, Esri, Carto m.fl.), polyline, markers |
| **Axios** | HTTP-klient mot backend |
| **ES modules** | `"type": "module"` i `package.json` |

**Vyer** (`App.jsx`): **App-läge** (`GeofenceEditor`), **Testmiljö** (`TestLab`), **ML** (`MLDashboard`), **Experiment** (`ExperimentMode`).

**Vite dev-proxy** (`vite.config.js`): anrop till `/api` proxas till `http://localhost:8000` med rewrite så backend kan svara utan `/api`-prefix om så är konfigurerat.

**Lokalt tillstånd:** bl.a. **localStorage** – t.ex. kartval i TestLab (`testlab_tile_source`), i GeofenceEditor **offline-kö** (`offline_queue`) och cache av spår för återuppspelning när nätverket saknas.

**Hjälpmoduler under `frontend/src/utils/`:**

| Fil | Funktion |
|-----|----------|
| **`osmTileLayer.js`** | Wrapper kring `L.tileLayer` som begränsar zoom i tile-URL (OSM publika tiles ~z19) så webbläsaren inte spammar 400-fel vid hög kart-zoom. |
| **`tracksApi.js`** | **`normalizeTracksListResponse(data, response)`** – säkerställer att `GET /tracks` tolkas som JSON-array; vid HTML-svar (fel API-bas-URL vid build) returneras tom lista + **tydligt felmeddelande** till UI. |

---

## 5. Backend – tekniker

| Teknik | Användning |
|--------|------------|
| **FastAPI** | Routes, dependency injection, `HTTPException`, `response_model` |
| **Uvicorn** | ASGI-server; `backend/run.py` läser `PORT`, `reload` av om inte `production` |
| **Pydantic v2** | `BaseModel`, fältvalidering, `Field`, `ConfigDict` |
| **psycopg2-binary** | PostgreSQL |
| **sqlite3** (stdlib) | SQLite när `DATABASE_URL` saknas |
| **python-dotenv** | Laddar `backend/.env` lokalt (finns i `backend/requirements.txt`; rot-`requirements.txt` driver full stack + ML) |
| **Pillow** | Bildhantering (t.ex. tiles/konvertering) |
| **requests** | Utgående HTTP |
| **pickle** | Laddning av ML-modeller (`_load_ml_pkl`) |
| **NumPy, scikit-learn** (rot-`requirements.txt`) | ML i samma process som API |
| **CORSMiddleware** | `allow_origins`, `allow_origin_regex` (t.ex. `*.up.railway.app`), `allow_methods`: **GET, POST, PUT, PATCH, DELETE, OPTIONS** (PATCH krävs för korsorigin-spåruppdateringar) |
| **StaticFiles** | Montering av `/static/tiles` för lokala PNG-tiles (om katalog finns) |
| **StreamingResponse** | CSV-export av positioner (`text/csv`, download) |
| **OpenAPI** | Swagger UI på `/docs` |

**Kärnfil:** `backend/main.py` (alla HTTP-endpoints nedan). Experiment-batch och liknande använder **`try` / `except HTTPException` / `except Exception` / `finally`** där anslutningar ska stängas konsekvent.

**Pipelines** (`docs/PIPELINES.md`, kod under `backend/pipelines/`):

- **`data_pipeline.py`** – filtrering/smoothing av GPS innan jämförelse (via `utils/gps_filter`).
- **`assessment_pipeline.py`** – punkt-, segment- och DTW-baserad bedömning (`utils/track_comparison.py`).
- **`ml_pipeline.py`** – stub; huvuddelen av ML-logiken ligger fortfarande i `main.py`.

**Övriga backend-utilities:** `backend/utils/gps_filter.py`, `backend/utils/track_comparison.py` (bl.a. DTW).

**Skript (urval):** `import_dogtracks_csv.py`, `migrate_ml_experiments.py`, `migrate_fas1.py`, `init_database.py`, `backup_database.py`, `truncate_tables.py`, `verify_postgres.py`, `diagnose_truth_levels.py`, migrering SQLite→Postgres (`migrate_sqlite_to_postgres.py`, `init_postgres.py`), m.fl.

---

## 6. Databas

### 6.1 Motor

- **PostgreSQL** när `DATABASE_URL` (eller reserv-URL:er) är satt – typiskt **Railway**.
- **SQLite** (`dogtracks.db` i backend) annars.

Schema skapas i **`init_db()`** med `CREATE TABLE IF NOT EXISTS` och **ALTER**/Postgres `DO $$`-block för efterhandskolumner.

### 6.2 Tabeller (i `init_db()`)

| Tabell | Innehåll |
|--------|----------|
| **geofences** | id, namn, typ, center, radie, `vertices_json`, `created_at` |
| **tracks** | id, namn, `track_type` (human/dog), `created_at`, **`human_track_id`**, **`track_source`** (own/imported/…) |
| **track_positions** | GPS-punkter, `timestamp`, `accuracy`, `verified_status`, korrigerade koordinater, `annotation_notes`, `environment`, **`truth_level`**, **`ml_confidence`**, **`ml_model_version`**, **`correction_source`** |
| **hiding_spots** | Gömmor kopplade till spår |
| **ml_prediction_feedback** | Feedback per prediktionsfil + `position_id` |
| **audit_log** | `action`, `old_value`/`new_value` (JSONB i Postgres, TEXT i SQLite), `position_id`, `track_id`, `timestamp` |

### 6.3 Separat migration: `ml_experiments`

Skapas med **`backend/scripts/migrate_ml_experiments.py`**: `original_track_json`, `corrected_track_json`, `model_version`, `rating`, `status` (pending/rated/skipped), tidsstämplar, FK till `tracks`.

---

## 7. Maskininlärning (offline + runtime)

| Komponent | Beskrivning |
|-----------|-------------|
| **`ml/analysis.py`** | Feature engineering, träning (RandomForest, ExtraTrees, GradientBoosting; **XGBoost** om installerat), korsvalidering, sparade artefakter |
| **`ml/train_only.py`**, **`ml/train_from_experiments.py`** | Träning; den senare kan använda experimentdata |
| **`ml/requirements.txt`** | numpy, pandas, scikit-learn, joblib, xgboost, matplotlib, seaborn, scipy, jupyter, ipython |
| **Artefakter** | `ml/output/*.pkl` (modell, scaler, ev. feature names), `gps_correction_model_info.json`, diagram (PNG) |
| **Git LFS** | `*.pkl` kan spåras med LFS (stora filer) |
| **Runtime i API** | `pickle.load`, `scaler.transform`, `model.predict`; vid LFS-pekare i containern → **HTTP 503** med förklaring |

---

## 8. REST API – fullständig lista

Bas: kör backend och öppna **`/docs`** för auktoritativ, interaktiv lista.  
Nedan: alla **primära** sökvägar i **`main.py`** (validerade mot kod). Många endpoints finns **dubbelt** med prefix **`/api`** för frontend/proxy (samma handler).

### 8.1 Hälsa och metadata

| Metod | Sökväg |
|-------|--------|
| GET | `/ping`, `/api/ping` |
| GET | `/version`, `/api/version` |

### 8.2 Geofences och utvärdering

| Metod | Sökväg |
|-------|--------|
| POST | `/geofences` |
| GET | `/geofences` |
| DELETE | `/geofences/{geofence_id}` |
| POST | `/evaluate` |

### 8.3 Spår och positioner

| Metod | Sökväg |
|-------|--------|
| POST | `/tracks` |
| GET | `/tracks`, `/api/tracks` |
| GET | `/tracks/cleanup-candidates`, `/api/tracks/cleanup-candidates` |
| POST | `/tracks/batch-delete`, `/api/tracks/batch-delete` |
| POST | `/tracks/rename-generic` |
| POST | `/tracks/{track_id}/smooth` |
| PATCH | `/tracks/{track_id}`, `/api/tracks/{track_id}` |
| DELETE | `/tracks/{track_id}`, `/api/tracks/{track_id}` |
| GET | `/tracks/{track_id}`, `/tracks/{track_id}/compare` |
| GET | `/tracks/compare` |
| GET | `/tracks/{track_id}/compare-segments` |
| GET | `/tracks/{track_id}/compare-dtw` |
| POST | `/tracks/{track_id}/positions` |
| PUT | `/track-positions/{position_id}` |
| POST | `/track-positions/{position_id}/approve-ml`, `/api/track-positions/.../approve-ml` |
| POST | `/track-positions/{position_id}/reject-ml`, `/api/track-positions/.../reject-ml` |
| GET | `/tracks/{track_id}/audit-log`, `/api/tracks/{track_id}/audit-log` |
| GET | `/track-positions` |
| GET | `/track-positions/export` (CSV via **StreamingResponse**) |

### 8.4 Export till ML

| Metod | Sökväg |
|-------|--------|
| GET, POST | `/export/annotations-to-ml` |

### 8.5 Gömställen (hiding spots)

| Metod | Sökväg |
|-------|--------|
| POST | `/tracks/{track_id}/hiding-spots` |
| GET | `/tracks/{track_id}/hiding-spots` |
| PUT | `/tracks/{track_id}/hiding-spots/{spot_id}` |
| DELETE | `/tracks/{track_id}/hiding-spots/{spot_id}` |

### 8.6 Karttiles (backend)

| Metod | Sökväg |
|-------|--------|
| GET | `/tiles/status` |
| POST | `/tiles/convert` |

### 8.7 ML-endpoints

| Metod | Sökväg |
|-------|--------|
| GET | `/ml/debug`, `/api/ml/debug` |
| GET | `/ml/model-info`, `/api/ml/model-info` |
| POST | `/ml/analyze`, `/api/ml/analyze` |
| POST | `/ml/apply-correction/{track_id}`, `/api/ml/apply-correction/{track_id}` |
| POST | `/ml/predict/{track_id}`, `/api/ml/predict/{track_id}` |
| GET | `/ml/predict/multiple`, `/api/ml/predict/multiple` |
| GET | `/ml/feedback-stats`, `/api/ml/feedback-stats` |
| GET | `/ml/predictions`, `/api/ml/predictions` |
| GET | `/ml/predictions/{filename}`, `/api/ml/predictions/{filename}` |
| DELETE | `/ml/predictions/{filename}`, `/api/ml/predictions/{filename}` |
| PUT | `/ml/predictions/{filename}/feedback/{position_id}`, `/api/ml/...` |
| POST | `/ml/predictions/{filename}/auto-feedback`, `/api/ml/...` |
| GET | `/ml/export-feedback`, `/api/ml/export-feedback` |

### 8.8 ML-experiment

| Metod | Sökväg |
|-------|--------|
| POST | `/ml/experiments/batch/generate`, `/api/ml/experiments/batch/generate` |
| GET | `/ml/experiments/next`, `/api/ml/experiments/next` |
| DELETE | `/ml/experiments/pending`, `/api/ml/experiments/pending` |
| POST | `/ml/experiments/purge-pending`, `/api/ml/experiments/purge-pending` |
| POST | `/ml/experiments/{experiment_id}/rate`, `/api/ml/experiments/{experiment_id}/rate` |
| POST | `/ml/experiments/{experiment_id}/skip`, `/api/ml/experiments/{experiment_id}/skip` |
| GET | `/ml/experiments/stats`, `/api/ml/experiments/stats` |

### 8.9 Statiska tiles (montering)

- GET under **`/static/tiles/...`** (PNG) om katalog finns – används av Leaflet som anpassat tile layer.

---

## 9. Hjälpverktyg och externa tjänster

| Objekt | Beskrivning |
|--------|-------------|
| **`tools/tile_converter.py`** | Laddar karttiles (OSM/Esri m.fl.), skalar med **Pillow**, **requests** – se `tools/README_TILE_CONVERTER.md` |
| **`jira/`** | Dokumentation för import-/projektflöden (t.ex. `IMPORT_GUIDE.md`) |
| **GitHub Actions** | `.github/workflows/build-push-ghcr.yml`: checkout med **`lfs: true`**, **verifiering** att viktiga `.pkl` inte är LFS-pekare, **docker/build-push-action** → taggar `ghcr.io/<owner>/gpsmcguffin:latest` och `:${{ github.sha }}` |
| **Git LFS** | **`.gitattributes`**: `*.pkl` → LFS. CI hämtar blobbar så Docker-`COPY ml/` får **binära** modeller (annars 503 i produktion). |
| **Railway** | Vanlig värd för frontend + backend + Postgres; se `archive/railway/`, `FRONTEND_RAILWAY_SETUP.md`, `DEPLOYMENT.md` |
| **Render** | `render.yaml` – exempel på Python web service |
| **Docker** | `Dockerfile`: Python 3.11-slim, sqlite3-paket, `COPY backend ml`, `CMD python3 /app/backend/run.py` |
| **Procfile** (rot) | `web: python backend/run.py` |

---

## 10. Dataformat och protokoll

- **Avstånd** – Haversine-formel används i frontend/backend för meter mellan GPS-punkter (t.ex. annotering, jämförelser).

- **JSON** – huvudsakligt API-format (UTF-8).
- **CSV** – export av positioner.
- **Pickle** – ML-modeller (version känslig mot Python/sklearn-version).
- **HTTP** – REST; **CORS preflight** för cross-origin (t.ex. frontend på annan Railway-URL än API). **PATCH** måste vara tillåten i CORS för spåruppdateringar.

---

## 11. Övriga dokument i repot (för fördjupning)

| Område | Filer (urval) |
|--------|----------------|
| API (delvis äldre) | `docs/API.md` |
| Experimentläge | `docs/EXPERIMENT_MODE.md`, `EXPERIMENT_MODE_QUICKSTART.md` |
| Pipelines | `docs/PIPELINES.md` |
| Kontext / planering | `docs/CONTEXT.md`, `README.md` |
| ML-strategi | `docs/ML_TRAINING_DATA_STRATEGY.md`, `ml/HOW_TRAINING_WORKS.md`, `ml/ML_GUIDE.md` |
| Deploy | `DEPLOYMENT.md`, `QUICK_START.md`, `PERSISTENT_STORAGE.md` |
| Railway | `archive/railway/RAILWAY_GUIDE.md`, `RAILWAY_ML_FIX.md` |

---

## 12. Versionshantering

- **Git** – källkod.
- **Git LFS** – stora modellfiler.
- **GitHub** – remote; **GHCR** – container images.

---

*Detta dokument är avsett att kunna klistras in i examensarbete eller bilagor.*

**Underhåll:** Uppdatera API-tabellerna om nya `@app.get/post/...` läggs till i `backend/main.py`. Snabb kontroll:

```bash
grep -E '^@app\.(get|post|put|patch|delete)\(' backend/main.py
```

Öppna även **`https://<backend>/docs`** mot en körande miljö för exakt schema.
