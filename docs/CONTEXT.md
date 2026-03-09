# Project Context

> Assistant reminder: read this file at the beginning of each session for shared context.

## Overview

**Dogtracks** ([dogtracks.se](https://dogtracks.se)) is a commercial company in the dog tracking sport industry. This is a companion project built to solve GPS accuracy problems for their platform.

**Project Nature:**

- Commercial project for Dogtracks company
- No hard deadlines - focus on quality and working solution
- Potential role/employment opportunity if problem is successfully solved
- Demonstration of technical competence and problem-solving ability

**Use Case:**
Users lay out custom tracks of varying shapes and sizes. After marking the track, they return to the starting point and send their dog to follow the track while carrying a phone or GPS collar.

## Problem We Are Solving

- GPS readings fluctuate even when someone walks the exact same path (5-50m error).
- The recorded track therefore appears distorted despite the dog following the original path.
- We want to detect when the dog is actually on the laid track, and when it deviates, with as much accuracy as possible.

**Critical Context:**
The system is used for both **training** and **competitions**. In competition settings, GPS accuracy directly affects:

- Official results and scores
- Fair competition between participants
- User trust in the platform

**Therefore**: Accuracy is paramount, especially for competition use where results determine winners and rankings.

## Approach

- Build an independent helper module/algorithm that can compare the dog’s live GPS points against the reference track.
- Run our own experiments and tests since we do not have direct access to the production app code.
- Keep the implementation easy to integrate later with the real app’s map/track features.
- Extend the tool with a dedicated test lab view where GPS points can be reviewed, marked correct/incorrect, and (when needed) dragged to their true locations so we collect training data for a future ML correction model.

## Project Structure

- `backend/`  
  FastAPI service (see `main.py`) with PostgreSQL (Railway eller lokalt via `DATABASE_URL`). Hanterar geofences, tracks (human/dog), GPS-positioner, hiding spots, jämförelse och ML-experiment. `requirements.txt` för dependencies; `run.py` som entry point.

- `frontend/`  
  React/Vite app. `src/App.jsx` toggles between the existing geofence editor (`components/GeofenceEditor.jsx`) and the new annotation-focused test lab (`components/TestLab.jsx`). The test lab visualises track positions, supports manual verification/correction, and integrates with the backend annotation endpoints. Configure backend URL via `VITE_API_URL`.

- `docs/`  
  Additional documentation such as API reference (`API.md`) and platform guides (`HOW_IT_WORKS.md`). This file (`CONTEXT.md`) holds the shared project brief.

- Root files  
  Deployment guides (`README.md`, `QUICK_START.md`, `DEPLOYMENT.md`, etc.), Dockerfile, environment descriptors (`runtime.txt`, `render.yaml`), and project-specific setup instructions for hosting providers (Railway, Render).

## Current Status (Latest Session)

### Database Migration

- ✅ Migrated from SQLite to PostgreSQL on Railway for persistent storage
- ✅ Backend supports both SQLite (local dev) and PostgreSQL (Railway) with automatic detection
- ✅ Data migration scripts available (`migrate_sqlite_to_postgres.py`, `migrate_from_railway_api.py`)

### TestLab Improvements (Completed Today)

- ✅ Fixed corrected positions: Both original and corrected positions are now displayed clearly
  - Original position shown as small grey point when corrected
  - Corrected position shown as main marker with connecting line
  - Original data is never replaced, both versions saved for ML training
- ✅ Fixed marker behavior: Marker no longer jumps back when marking as correct after moving
- ✅ Fixed position tracking: Correct position ID is saved when dragging markers (uses ref to track during drag operation)
- ✅ Added scroll for entire sidebar: Full sidebar is now scrollable, not just position list
- ✅ Changed position list to dropdowns: Replaced long list with dropdowns for human and dog tracks
- ✅ Added navigation buttons: "Föregående" (Previous) and "Nästa" (Next) buttons to navigate between positions
- ✅ Improved map zoom: Added multiple tile layers (Esri, CartoDB) with higher zoom support (up to zoom 23)
- ✅ Fixed marker colors: Markers now use track color (red for human, purple for dog) instead of status color
- ✅ Prevented marker clicks from changing selected position when one is already selected in dropdown

### Known Issues Fixed

- ✅ Position #1 no longer gets updated when adjusting position #2
- ✅ Corrected positions are preserved when marking as correct
- ✅ Marker stays in place after correction is saved

### Technical Details

- Uses `draggingPositionIdRef` to track which position is being adjusted during drag operations
- Uses `draggableMarkerPositionIdRef` to track which position the marker belongs to
- All annotation functions now use `selectedPositionId` directly instead of `selectedPosition.id` to avoid closure issues
- Sidebar has proper scroll structure with `overflow-y-auto` on inner container

### Code Cleanup (Completed)

- ✅ Removed all debug console.log statements from TestLab.jsx and GeofenceEditor.jsx
- Console.warn and console.error statements kept for actual error handling

### Batch-Justeringsläge (Completed Today)

- ✅ Implementerat batch-justeringsläge i TestLab för effektiv massjustering av positioner
- ✅ Växlingsknapp för att aktivera/inaktivera batch-läge
- ✅ I batch-läge: ändringar sparas med status "pending" istället för "incorrect"
- ✅ Automatisk aktivering av justering när man navigerar mellan positioner i batch-läge
- ✅ "Godkänn alla justerade"-knapp för att godkänna flera positioner på en gång
- ✅ Synlig placering av "Godkänn alla justerade"-knappen längst upp i sidebar
- ✅ Klick på kartan som alternativ till att dra markören i batch-läge
- ✅ Båda metoderna (dra markören eller klicka på kartan) fungerar parallellt
- ✅ Automatisk navigering till nästa position när man trycker "Korrekt" i batch-läge
- ✅ Justering förblir aktivt i batch-läge så användaren kan fortsätta justera nästa position direkt
- ✅ Fixat scroll i sidebar så bara sidebar scrollar, inte kartan

### Technical Details (Batch-läge)

- Använder `batchAdjustMode` state för att växla mellan normal-läge och batch-läge
- I batch-läge: `handleCorrectionDragEnd` sparar med status "pending" istället för "incorrect"
- Klick-hantering på kartan flyttar markören och sparar ändringen direkt
- `handleMarkCorrect` navigerar automatiskt till nästa position i batch-läge
- `handleSelectPosition` aktiverar justering automatiskt när batch-läge är aktivt

### Tile-hantering och CORS-fixar (Session 2024-12-XX)

- ✅ **CORS-konfiguration fixad för Railway**
  - Använder `allow_origin_regex` för att matcha alla Railway-domäner dynamiskt
  - Fixat så `/tiles/convert` och `/tiles/status` endpoints fungerar korrekt
  - StaticFiles mountad på `/static/tiles` för att undvika route-konflikt med API-endpoints
- ✅ **Statisk fil-server för tiles**
  - Tiles sparas i `backend/tiles` och serveras som statiska filer
  - Frontend laddar tiles från `${API_BASE}/static/tiles/{z}/{x}/{y}.png`
  - Fungerar både lokalt och på Railway
- ✅ **Förbättrad tile-konvertering**
  - Ökade zoom-nivåer för tile-konvertering:
    - Stort område: zoom 10-18 (tidigare 10-16)
    - Medelstort område: zoom 12-22 (tidigare 12-18)
    - Litet område: zoom 14-23 (tidigare 14-20)
  - Ny endpoint `/tiles/status` för att kontrollera tillgänglighet och tile-storlek
  - Automatisk detektering av lokala tiles vid start
  - Dynamisk anpassning av minZoom/maxZoom baserat på tillgängliga tiles
- ✅ **Dependencies fixade**
  - Lagt till `pillow` och `requests` i root `requirements.txt` (Railway använder root-filen)
  - Fixat `get_tile_bounds` funktion i backend (fel parameterordning)
  - Förbättrad felhantering i tile-endpoints

### Snabbjusteringsläge (Session 2024-12-XX)

- ✅ **Förbättrad justeringsworkflow**
  - Klicka direkt på kartan för att flytta position (fungerar även utan batch-läge)
  - Automatisk framsteg till nästa position efter "Korrekt" (fungerar även utan batch-läge)
  - Justering förblir aktivt automatiskt för nästa position
  - Snapping avstängt som standard för bättre kontroll
- ✅ **UI-förbättringar**
  - Tydligare instruktioner när justering är aktivt
  - Knappen heter nu "🎯 Justera position (klicka på kartan)"
  - Visar tips om snabbjustering när det är aktivt

### Kända problem att fixa

- ⚠️ **Tiles visas inte när man zoomar in närmare**
  - Problem: Tiles laddas bara för vissa zoom-nivåer, men kartan kan zooma högre
  - Lösning: Ökade zoom-nivåer för tile-konvertering (se ovan)
  - Status: Fixat i kod, behöver testas efter deployment
- ⚠️ **Tiles kan vara tomma om de inte finns för aktuellt område/zoom**
  - Lösning: Dynamisk anpassning av minZoom/maxZoom baserat på tillgängliga tiles
  - Status: Implementerat, behöver testas

### Next Steps (Pending)

- Testa tile-konvertering med nya zoom-nivåer efter deployment
- Verifiera att tiles fungerar korrekt när man zoomar in närmare
- Continue testing annotation workflow
- Future: ML model training with annotated data
