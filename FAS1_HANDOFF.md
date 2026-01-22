# FAS 1 - Stabil Grund: Handoff & Implementeringsplan

**Datum:** 2025-01-XX  
**Status:** Planerad - Kräver implementering  
**Fokus:** Göra systemet korrekt, förklarbart och tillförlitligt innan vidare utveckling

---

## 📋 Nuvarande Status

### ✅ Vad som redan fungerar

1. **Backend (FastAPI + PostgreSQL)**
   - API-endpoints för tracks, positions, geofences
   - Databas med `tracks` och `track_positions` tabeller
   - ML-endpoints för korrigering och förutsägelse (`/ml/apply-correction`, `/ml/predict`)
   - GPS-filtering och smoothing i `backend/utils/gps_filter.py`

2. **Frontend (React + Leaflet)**
   - TestLab-komponent för manuell korrigering
   - ML Dashboard för visualisering
   - Karta med tile layers

3. **ML-modell**
   - Extra Trees modell implementerad
   - Feature engineering (22-30 features)
   - Träningspipeline i `ml/analysis.py`
   - Feedback-loop (sparas i `verified_status`)

### ⚠️ Vad som saknas för FAS 1

1. **Truth levels (T0-T3)** - INTE implementerat
2. **Confidence scores** - INTE implementerat
3. **Pipeline-separation** - INTE tydligt separerat
4. **Modellversionering** - INTE implementerat
5. **Tävlingslåsning** - INTE implementerat
6. **Segmentbaserad spårjämförelse** - Delvis implementerat (DTW finns, men inte segmentbaserad)

---

## 🎯 FAS 1 Prioriterade Huvudpunkter

### 1. Tydlig definition av ground truth

**Krav:**
- Införa truth levels (T0–T3):
  - **T0**: Manuell annotering (absolut sanning)
  - **T1**: Verifierat human track
  - **T2**: ML-korrigerad position
  - **T3**: Rå GPS
- Alla positioner och analyser ska explicit ange vilken truth level de bygger på

**Nuvarande status:**
- ❌ Truth levels finns inte i databasen
- ❌ Ingen kolumn för `truth_level` i `track_positions`
- ❌ Ingen logik för att tilldela truth levels

**Implementering:**
1. Lägg till `truth_level` kolumn i `track_positions` tabell
2. Uppdatera databas-migration
3. Logik för att automatiskt tilldela truth levels:
   - T0: När `corrected_lat/lng` finns OCH `verified_status = 'correct'` OCH manuellt korrigerad
   - T1: När `track_type = 'human'` OCH `verified_status = 'correct'`
   - T2: När ML-korrigering applicerad OCH `ml_confidence > threshold`
   - T3: Rå GPS (default)
4. Uppdatera API:er för att returnera truth level
5. Uppdatera frontend för att visa truth level

---

### 2. Tydlig separation av pipelines

**Krav:**
- **Datapipeline**: filtering, smoothing, sanity checks (ingen ML)
- **ML-pipeline**: korrigering + confidence, versionerad modell
- **Bedömningspipeline**: avgör följer spår / avvikelse / osäker

**Nuvarande status:**
- ⚠️ Filtering finns i `gps_filter.py` men används inte konsekvent
- ⚠️ ML-korrigering blandas med datahantering
- ⚠️ Ingen tydlig separation mellan pipelines

**Implementering:**
1. Skapa `backend/pipelines/` struktur:
   ```
   pipelines/
   ├── data_pipeline.py      # Filtering, smoothing, sanity checks
   ├── ml_pipeline.py         # ML-korrigering med confidence
   └── assessment_pipeline.py # Bedömning: följer/avvikelse/osäker
   ```
2. Refaktorera `gps_filter.py` till `data_pipeline.py`
3. Separera ML-logik från datahantering
4. Skapa tydliga interfaces mellan pipelines
5. Dokumentera pipeline-flöde

---

### 3. Confidence score som central del av systemet

**Krav:**
- Varje ML-korrigering ska ha ett confidence-värde (0–1)
- Fasta trösklar för giltighet
- Möjlighet att förklara varför confidence är låg

**Nuvarande status:**
- ❌ Ingen confidence score i databasen
- ❌ ML-modellen returnerar ingen confidence
- ❌ Ingen logik för confidence-trösklar

**Implementering:**
1. Lägg till `ml_confidence` kolumn i `track_positions`
2. Uppdatera ML-modellen för att returnera confidence:
   - Använd prediction variance/uncertainty
   - Eller använd ensemble methods för confidence
3. Implementera confidence-trösklar:
   - `confidence >= 0.8`: Hög tillförlitlighet, acceptera automatiskt
   - `0.5 <= confidence < 0.8`: Måttlig, kräver granskning
   - `confidence < 0.5`: Låg, kräver manuell korrigering
4. Lägg till confidence-förklaringar (vilka features påverkar confidence)
5. Uppdatera frontend för att visa confidence

---

### 4. Spårjämförelse baserad på beteende, inte punkt-till-punkt

**Krav:**
- Segmentbaserad jämförelse (riktning, kurvighet, lokal avvikelse)
- DTW som komplement, inte grund

**Nuvarande status:**
- ⚠️ Jämförelse finns i `/tracks/{id}/compare` endpoint
- ⚠️ Använder punkt-till-punkt avstånd
- ⚠️ DTW kan finnas men används inte konsekvent

**Implementering:**
1. Skapa segmentbaserad jämförelse:
   - Dela spår i segment (t.ex. 10-20 positioner per segment)
   - Beräkna riktning per segment
   - Beräkna kurvighet per segment
   - Jämför segment-beteende
2. Implementera DTW som komplement
3. Kombinera segmentbaserad + DTW för bedömning
4. Uppdatera `/tracks/{id}/compare` endpoint
5. Uppdatera frontend för att visa segmentbaserad analys

---

### 5. TestLab som domar- och granskningsverktyg

**Krav:**
- Visa ML-förslag vs manuell korrigering
- Möjlighet att godkänna/underkänna
- Audit trail för ändringar

**Nuvarande status:**
- ✅ TestLab finns och fungerar
- ⚠️ Visar inte ML-förslag jämfört med manuell korrigering
- ⚠️ Ingen audit trail

**Implementering:**
1. Lägg till "Jämför ML vs Manuell"-läge i TestLab
2. Visa både ML-korrigerad och manuell korrigering samtidigt
3. Lägg till "Godkänn/Underkänn ML"-knappar
4. Skapa `audit_log` tabell:
   ```sql
   CREATE TABLE audit_log (
       id SERIAL PRIMARY KEY,
       position_id INTEGER,
       action TEXT,  -- 'manual_correction', 'ml_approval', 'ml_rejection'
       old_value JSONB,
       new_value JSONB,
       user_id TEXT,
       timestamp TEXT
   )
   ```
5. Logga alla ändringar i audit trail
6. Visa audit trail i TestLab

---

### 6. Modellversionering och låsning per tävling

**Krav:**
- Samma input ska alltid ge samma output
- Ingen reträning under pågående tävling

**Nuvarande status:**
- ❌ Ingen modellversionering
- ❌ Ingen tävlingslåsning
- ❌ Modellen kan ändras mellan körningar

**Implementering:**
1. Skapa modellversionering:
   - Spara modeller med version (t.ex. `model_v1.2.3.pkl`)
   - Spara modell-metadata (träningsdatum, features, performance)
   - Skapa `model_versions` tabell:
     ```sql
     CREATE TABLE model_versions (
         id SERIAL PRIMARY KEY,
         version TEXT UNIQUE,
         model_path TEXT,
         trained_at TEXT,
         features JSONB,
         performance_metrics JSONB,
         is_active BOOLEAN DEFAULT FALSE
     )
     ```
2. Implementera tävlingslåsning:
   - Lägg till `competition_id` i `tracks` tabell
   - Lägg till `locked_model_version` i `competitions` tabell
   - När tävling är aktiv: lås modellversion
   - Förhindra reträning under aktiv tävling
3. Uppdatera ML-endpoints för att använda låst modellversion
4. Skapa admin-interface för modellhantering

---

## 📊 Implementeringsordning (Rekommenderad)

### Steg 1: Grundläggande struktur (1-2 dagar)
1. ✅ Skapa `FAS1_HANDOFF.md` (detta dokument)
2. Lägg till `truth_level` kolumn i databas
3. Skapa `pipelines/` struktur
4. Lägg till `ml_confidence` kolumn

### Steg 2: Truth levels (2-3 dagar)
1. Implementera logik för att tilldela truth levels
2. Uppdatera API:er
3. Uppdatera frontend

### Steg 3: Pipeline-separation (2-3 dagar)
1. Refaktorera till separerade pipelines
2. Dokumentera pipeline-flöde
3. Testa pipeline-separation

### Steg 4: Confidence scores (3-4 dagar)
1. Implementera confidence-beräkning i ML
2. Lägg till confidence-trösklar
3. Uppdatera frontend för att visa confidence

### Steg 5: Segmentbaserad jämförelse (3-4 dagar)
1. Implementera segmentbaserad analys
2. Integrera DTW
3. Uppdatera compare-endpoint

### Steg 6: TestLab-förbättringar (2-3 dagar)
1. Lägg till ML vs Manuell-jämförelse
2. Implementera audit trail
3. Uppdatera TestLab UI

### Steg 7: Modellversionering (3-4 dagar)
1. Implementera modellversionering
2. Implementera tävlingslåsning
3. Skapa admin-interface

**Total tidsåtgång:** ~3-4 veckor

---

## 🔍 Tekniska Detaljer

### Databasändringar

```sql
-- Lägg till truth_level i track_positions
ALTER TABLE track_positions 
ADD COLUMN truth_level TEXT DEFAULT 'T3' 
CHECK (truth_level IN ('T0', 'T1', 'T2', 'T3'));

-- Lägg till ml_confidence
ALTER TABLE track_positions 
ADD COLUMN ml_confidence DOUBLE PRECISION;

-- Lägg till ml_model_version (vilken modellversion användes)
ALTER TABLE track_positions 
ADD COLUMN ml_model_version TEXT;

-- Skapa audit_log tabell
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    position_id INTEGER,
    track_id INTEGER,
    action TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    user_id TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (position_id) REFERENCES track_positions(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

-- Skapa model_versions tabell
CREATE TABLE model_versions (
    id SERIAL PRIMARY KEY,
    version TEXT UNIQUE NOT NULL,
    model_path TEXT NOT NULL,
    trained_at TEXT NOT NULL,
    features JSONB,
    performance_metrics JSONB,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TEXT NOT NULL
);

-- Skapa competitions tabell
CREATE TABLE competitions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    locked_model_version TEXT,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TEXT NOT NULL,
    FOREIGN KEY (locked_model_version) REFERENCES model_versions(version)
);

-- Lägg till competition_id i tracks
ALTER TABLE tracks 
ADD COLUMN competition_id INTEGER,
ADD FOREIGN KEY (competition_id) REFERENCES competitions(id);
```

---

## 📝 Nästa Steg

1. **Granska detta dokument** - Bekräfta att alla prioriteringar är korrekta
2. **Börja med Steg 1** - Grundläggande struktur och databasändringar
3. **Iterativ implementering** - Implementera en punkt i taget och testa
4. **Dokumentera** - Uppdatera dokumentation efter varje implementering

---

## ❓ Öppna Frågor

1. **Confidence-beräkning**: Hur ska confidence beräknas? 
   - Prediction variance?
   - Ensemble uncertainty?
   - Feature-based confidence?

2. **Truth level T1**: Hur verifierar vi att ett human track är "verifierat"?
   - Automatiskt när `verified_status = 'correct'`?
   - Kräver manuell verifiering?

3. **Tävlingslåsning**: När ska en tävling låsas?
   - Automatiskt vid start?
   - Manuellt av admin?

4. **Segmentbaserad jämförelse**: Hur långa ska segmenten vara?
   - Fast längd (t.ex. 10 positioner)?
   - Dynamisk baserat på rörelse?

---

**Senast uppdaterad:** 2025-01-XX  
**Status:** Planerad - Väntar på godkännande
