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

### 2. Confidence score förbättras

**Varför:** Nu används en enkel heuristik. Bättre confidence gör T2 mer användbart.

**Uppgifter:**
- [ ] Beräkna confidence från modellen (t.ex. prediction variance, quantile regression eller ensemble)
- [ ] Spara `ml_confidence` konsekvent i `apply_ml_correction`
- [ ] (Senare) Förklaring när confidence är låg (vilka features påverkar)

**Filer att ändra:**
- `backend/main.py` (apply_ml_correction)
- Eventuellt `ml/analysis.py` om vi ändrar tränings-/exportflöde

**Estimat:** 1–2 dagar

---

### 3. Pipeline-separation

**Varför:** Tydlig separation data → ML → bedömning, enligt FAS 1.

**Uppgifter:**
- [ ] Skapa `backend/pipelines/`:
  - `data_pipeline.py` – filtering, smoothing (refaktorera från `gps_filter.py`)
  - `ml_pipeline.py` – ML-korrigering + confidence
  - `assessment_pipeline.py` – bedömning: följer spår / avvikelse / osäker
- [ ] Använd pipelines i API:t istället för att köra allt i `main.py`
- [ ] Kort dokumentation av flödet (t.ex. i `docs/` eller `FAS1_`)

**Estimat:** 2–3 dagar

---

### 4. TestLab: ML vs manuell + audit

**Varför:** TestLab ska vara “domarverktyg” – jämföra ML med manuell och spåra ändringar.

**Uppgifter:**
- [ ] Läge “Jämför ML vs manuell” – visa båda samtidigt (t.ex. två markörer/färger)
- [ ] Knappar “Godkänn ML” / “Underkänn ML” som sätter `correction_source` resp. återställer
- [ ] Logga ändringar i `audit_log` vid korrigering / godkännande / underkännande
- [ ] (Valfritt) Enkel vy av audit trail i TestLab

**Estimat:** 2–3 dagar

---

### 5. Segmentbaserad jämförelse

**Varför:** FAS 1 vill ha beteende-baserad jämförelse (riktning, kurvighet), inte bara punkt-till-punkt.

**Uppgifter:**
- [ ] Dela spår i segment (t.ex. efter riktningsändring eller fast längd)
- [ ] Beräkna riktning och kurvighet per segment
- [ ] Ny eller utökad `GET /tracks/.../compare` som returnerar segmentbaserad statistik
- [ ] DTW som komplement, inte ensam grund

**Estimat:** 3–4 dagar

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
