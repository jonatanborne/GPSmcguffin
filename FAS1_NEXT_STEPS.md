# FAS 1 – Nästa steg: Hur vi förbättrar vidare

**Syfte:** Tydlig prioriterad plan för vad vi ska göra härnäst.

---

## Rekommenderad ordning

### 1. Frontend-integration ✅ KLART

**Varför först:** Backend returnerar redan truth levels – användare ser inget ännu. Snabb vinst.

**Uppgifter:**
- [x] **TestLab:** Visa truth level per position (T0/T1/T2/T3)
  - Badge vid vald position, confidence/modell när T2
  - Färgkodning: T0=grön, T1=blå, T2=lila, T3=grå
  - Truth levels i position-lista, statistik (T0–T3), markör-tooltips
- [x] **ML Dashboard:** Truth summary för valt spår (T0/T1/T2/T3), legend i modellsektion
- [x] **Spårlista / track-vy:** Sammanfattning (antal T0/T1/T2/T3) vid valt spår i ML-korrigering

**Filer ändrade:**
- `frontend/src/components/TestLab.jsx`
- `frontend/src/components/MLDashboard.jsx`

**Estimat:** 1–2 dagar

---

### 2. Confidence score förbättras ✅ KLART (Feb 2026)

**Varför:** Nu används en enkel heuristik. Bättre confidence gör T2 mer användbart.

**Uppgifter:**
- [x] Beräkna confidence från modellen (ensemble tree std → osäkerhet; `_predict_with_confidence`)
- [x] Spara `ml_confidence` konsekvent i `apply_ml_correction`
- [ ] (Senare) Förklaring när confidence är låg (vilka features påverkar)

**Filer ändrade:**
- `backend/main.py`: `_predict_with_confidence()`, apply_ml_correction, predict endpoints (ml_confidence i output)
- `ml/analysis.py`: `model_version` i model_info vid träning

**Estimat:** 1–2 dagar

---

### 3. Pipeline-separation ✅ KLART

**Varför:** Tydlig separation data → ML → bedömning, enligt FAS 1.

**Uppgifter:**
- [x] Skapa `backend/pipelines/`:
  - `data_pipeline.py` – filtering, smoothing (anropar `utils.gps_filter`)
  - `ml_pipeline.py` – stub; ML-logik ligger kvar i `main.py` (kan flyttas senare)
  - `assessment_pipeline.py` – bedömning: punkt-, segment- och DTW-jämförelse
- [x] Använd pipelines i API:t: compare, compare-segments, compare-dtw anropar `data_pipeline.run` och `assessment_pipeline.run_*`
- [x] Dokumentation: `docs/PIPELINES.md`

**Filer:** `backend/pipelines/`, `backend/main.py`, `docs/PIPELINES.md`

---

### 4. TestLab: ML vs manuell + audit ✅ KLART (Feb 2026)

**Varför:** TestLab ska vara “domarverktyg” – jämföra ML med manuell och spåra ändringar.

**Uppgifter:**
- [x] Läge “Jämför ML vs manuell” – visa båda samtidigt (t.ex. två markörer/färger)
- [x] Knappar “Godkänn ML” / “Underkänn ML” som sätter `correction_source` resp. återställer
- [x] Logga ändringar i `audit_log` vid korrigering / godkännande / underkännande
- [x] Enkel vy av audit trail i TestLab

**Estimat:** 2–3 dagar

---

### 5. Segmentbaserad jämförelse ✅ KLART

**Varför:** FAS 1 vill ha beteende-baserad jämförelse (riktning, kurvighet), inte bara punkt-till-punkt.

**Uppgifter:**
- [x] Dela spår i segment (efter riktningsändring; `split_track_into_segments` i `utils/track_comparison.py`)
- [x] Beräkna riktning och kurvighet per segment (`avg_bearing_deg`, `curvature_deg_per_m`; exponeras i `segment_matches`)
- [x] `GET /tracks/{track_id}/compare-segments` returnerar segmentbaserad statistik (inkl. GPS-smoothing)
- [x] DTW som komplement: `GET /tracks/{track_id}/compare-dtw` (Dynamic Time Warping, samma smoothing)

**Filer:** `backend/utils/track_comparison.py`, `backend/main.py`

---

### 6. Modellversionering + tävlingslås

**Varför:** Samma input → samma output; ingen reträning under pågående tävling.

**Uppgifter:**
- [ ] Spara modell + metadata med version (t.ex. `model_v1.0.0.pkl` + `model_info`)
- [ ] Läsa/skriva version i `model_versions`
- [ ] `apply_ml_correction` använder angiven (eller “aktiv”) modellversion
- [ ] Tävlingslås: vid aktiv tävling använd endast låst modellversion, ingen reträning

**Estimat:** 2–3 dagar

---

## Hur du väljer vad som passar idag

**Vill du se resultat snabbt i UI:**  
→ Börja med **1. Frontend-integration**.

**Vill du förstärka ML / tillförlitlighet:**  
→ **2. Confidence** eller **6. Modellversionering**.

**Vill du renare arkitektur:**  
→ **3. Pipeline-separation**.

**Vill du förstärka TestLab som verktyg:**  
→ **4. TestLab ML vs manuell + audit**.

**Vill du förbättra spårjämförelse:**  
→ **5. Segmentbaserad jämförelse**.

---

## Praktiskt: kom igång på en ny dator

1. `git pull` (om du inte redan syncat).
2. Läs `FAS1_PROGRESS_SUMMARY.md` för kontext.
3. Välj **en** prioritet ovan (t.ex. “1. Frontend-integration”).
4. Säg till Cursor: *”Vi ska jobba på [valt steg]. Läs FAS1_NEXT_STEPS.md och FAS1_PROGRESS_SUMMARY.md.”*

Då har både du och Cursor samma bild av vad som är nästa förbättring.

---

## Samarbete med Cursor/AI

Så att vi är på samma sida vid kodändringar:

- **Innan ändringar:** Cursor beskriver kort *vad* som ska göras, *var* (filer/endpoints) och *varför*.
- **Efter ändringar:** Kort sammanfattning av vad som ändrats, vilka API:er som påverkats och om frontend behöver uppdateras.
- Vid behov uppdateras denna fil (eller FAS1_PROGRESS_SUMMARY.md) med genomförda steg och beslut.
