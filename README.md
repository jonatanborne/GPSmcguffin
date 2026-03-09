# Dogtracks Geofence Kit

En fristående modul för geofence-hantering, GPS-spår och ML-korrigering i hundspårningsappar.

## Syfte

- Hantera geofences (virtuella gränser) på en karta
- Jämföra hund- och människaspår (punkt, segment, DTW)
- ML-baserad GPS-korrigering (XGBoost) med experiment-feedback
- Integration med Dogtracks CSV-import

## Projektstruktur

```
dogtracks-geofence-kit/
├── backend/          # FastAPI + Postgres
├── frontend/         # React + Vite + Leaflet
├── ml/               # Träning, analys, experiment
├── docs/             # Dokumentation
└── archive/          # Arkiverade planer
```

## Snabbstart

```bash
# Backend (kräver DATABASE_URL för Postgres)
cd backend && pip install -r requirements.txt && uvicorn main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```

## Dokumentation

| Fil | Innehåll |
|-----|----------|
| [docs/CONTEXT.md](docs/CONTEXT.md) | Projektöversikt och status |
| [docs/PLAN_EGNA_VS_KUNDSPAR.md](docs/PLAN_EGNA_VS_KUNDSPAR.md) | Egna vs kundspår, import, experiment |
| [docs/API.md](docs/API.md) | API-referens |
| [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) | Teknisk beskrivning |
| [docs/EXPERIMENT_MODE.md](docs/EXPERIMENT_MODE.md) | Experiment Mode (bedöm ML) |
| [QUICK_START.md](QUICK_START.md) | Lokal start |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Cloud-deployment (Railway, Render) |
| [archive/railway/RAILWAY_GUIDE.md](archive/railway/RAILWAY_GUIDE.md) | Railway-specifik guide |

## Teknisk stack

- **Backend**: FastAPI, Postgres
- **Frontend**: React, Vite, Leaflet, Tailwind
- **ML**: XGBoost, scikit-learn
