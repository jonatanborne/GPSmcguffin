# Project Context

> Assistant reminder: read this file at the beginning of each session for shared context.

## Overview

Dogtracks is a companion project for a dog tracking sport. Users lay out custom tracks of varying shapes and sizes. After marking the track, they return to the starting point and send their dog to follow the track while carrying a phone or GPS collar.

## Problem We Are Solving

- GPS readings fluctuate even when someone walks the exact same path.
- The recorded track therefore appears distorted despite the dog following the original path.
- We want to detect when the dog is actually on the laid track, and when it deviates, with as much accuracy as possible.

## Approach

- Build an independent helper module/algorithm that can compare the dog’s live GPS points against the reference track.
- Run our own experiments and tests since we do not have direct access to the production app code.
- Keep the implementation easy to integrate later with the real app’s map/track features.
- Extend the tool with a dedicated test lab view where GPS points can be reviewed, marked correct/incorrect, and (when needed) dragged to their true locations so we collect training data for a future ML correction model.

## Project Structure

- `backend/`  
  FastAPI service (see `main.py`) with a local SQLite database (`data.db`). Handles geofences, tracks (human/dog), GPS positions, hiding spots, and comparison endpoints. `requirements.txt` lists Python dependencies; `run.py` provides an entry point when deploying.

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

### Code Cleanup (Completed Today)
- ✅ Removed all debug console.log statements from TestLab.jsx and GeofenceEditor.jsx
- Console.warn and console.error statements kept for actual error handling

### Next Steps (Pending)
- Continue testing annotation workflow
- Future: ML model training with annotated data


