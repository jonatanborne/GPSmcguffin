# Dogtracks Geofence Kit

En fristående modul för hantering av geofences i hundspårningsappar.

## Syfte

Detta projekt skapar en modul som kan:
- Ta emot GPS-punkter och avgöra om hunden är inom eller utanför ett område
- Hantera geofences (virtuella gränser) på en karta
- Ge enkla API:er för integration i Dogtracks system

## Projektstruktur

```
dogtracks-geofence-kit/
├── backend/          # FastAPI backend
├── frontend/         # React + Vite frontend
├── docs/            # Dokumentation
└── README.md
```

## Teknisk stack

- **Backend**: FastAPI (Python)
- **Frontend**: React + Vite + Leaflet
- **Databas**: SQLite (lokalt)
- **Versionshantering**: Git + GitHub

## Installation

### Backend
```bash
cd backend
pip install fastapi uvicorn pydantic
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend körs på `http://localhost:3000` och kommunicerar automatiskt med backend via proxy.

## Status

Dag 1: Projektstruktur skapad ✅
Dag 2: Backend API skelett klart (ping, geofences, evaluate) ✅
Dag 3: Frontend med karta och geofence-editor klart ✅
Dag 4: Komplett system med ENTER/EXIT-logik, polygoner och testinstruktioner ✅

## Testinstruktioner

Se `TEST_INSTRUCTIONS.md` för detaljerade testscenarier och felsökning.
