# Pipelines (FAS1) – Data → ML → Bedömning

Kort beskrivning av pipeline-separationen i backend.

## Översikt

- **Data pipeline** – rensar och smoothar GPS-data innan jämförelse/ML.
- **ML pipeline** – ML-korrigering + confidence (logiken ligger ännu i `main.py`, stub i `pipelines/ml_pipeline.py`).
- **Assessment pipeline** – jämförelse och bedömning mellan spår (punkt, segment, DTW).

## Data pipeline (`pipelines/data_pipeline.py`)

- **Input:** Råa positioner (t.ex. DB-rader med `position_lat`, `position_lng`, `timestamp`, `accuracy`).
- **Steg:** Filtrering (accuracy, hastighet) + moving average (smoothing) via `utils.gps_filter`.
- **Output:** `points` (lista `{lat, lng, timestamp}`) + `filter_stats`.
- **Används av:** Alla compare-endpoints (compare, compare-segments, compare-dtw) kör data-pipelinen först på human- och dog-spår.

## Assessment pipeline (`pipelines/assessment_pipeline.py`)

- **run_point_assessment(human_points, dog_points)** – punkt-för-punkt: minsta avstånd per human-punkt till dog, ger `average_meters`, `max_meters`, `match_percentage`.
- **run_segment_assessment(human_points, dog_points)** – segmentbaserad jämförelse (riktning, kurvighet, similarity per segment) via `utils.track_comparison.compare_tracks_by_segments`.
- **run_dtw_assessment(human_points, dog_points)** – DTW-jämförelse via `utils.track_comparison.dtw_distance`.

Används av: `GET /tracks/{id}/compare`, `/tracks/compare`, `/tracks/{id}/compare-segments`, `/tracks/{id}/compare-dtw`.

## ML pipeline (`pipelines/ml_pipeline.py`)

- **Tänkt roll:** Ta positioner + modell → returnera korrigerade positioner med confidence.
- **Nuläge:** Stub; själva ML-logiken (feature-building, `_predict_with_confidence`, apply/predict) ligger kvar i `main.py`. Kan flyttas hit vid refaktorering.

## Flöde i API

1. **Jämförelse:** Hämta positioner från DB → **data_pipeline.run** (human + dog) → **assessment_pipeline** (punkt/segment/DTW) → svar till klient.
2. **ML-korrigering:** Hämta positioner från DB → (framöver: **ml_pipeline**) → spara tillbaka till DB; idag sker allt i `main.py`.

## Filer

- `backend/pipelines/__init__.py` – exporterar `run_data_pipeline`, `run_point_assessment`, `run_segment_assessment`, `run_dtw_assessment`.
- `backend/pipelines/data_pipeline.py` – data-pipeline.
- `backend/pipelines/assessment_pipeline.py` – bedömnings-pipeline.
- `backend/pipelines/ml_pipeline.py` – stub för ML-pipeline.
