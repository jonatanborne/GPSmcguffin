# Experiment Mode - Reinforcement Learning från kundspår

## Översikt

Experiment Mode är ett system för att träna ML-modellen baserat på **helhetsbedömningar** av korrigerade spår, istället för punkt-för-punkt korrigeringar.

### Varför två träningssystem?

**Befintligt system (TestLab):**
- Manuell punkt-för-punkt korrigering
- Exakt träningsdata
- Tidskrävande
- Bäst för: Precision, exakta GPS-fel

**Nytt system (Experiment Mode):**
- Helhetsbedömning av hela spår (betyg 1-10)
- Snabbare feedback
- Lär modellen dina preferenser
- Bäst för: Lära modellen vad som "ser bra ut"

## Workflow

### 1. Förberedelse

Säkerställ att du har:
- Kundspår importerade i databasen (`track_source='imported'`)
- En tränad ML-modell (`ml/output/gps_correction_model_best.pkl`)

### 2. Generera experiment

```bash
# Kör migrering först (en gång)
export DATABASE_URL="postgresql://..."
python backend/scripts/migrate_ml_experiments.py
```

I appen:
1. Gå till fliken **"Experiment"**
2. Klicka **"Generera experiment"**
3. Modellen korrigerar alla kundspår och sparar som experiment

### 3. Bedöm experiment

För varje experiment:
1. Se original spår (grå, streckad) och korrigerat spår (röd, solid)
2. Bedöm hur bra korrigeringen är (1-10)
   - **1-3**: Dålig (för mycket/lite korrigering, konstiga mönster)
   - **4-7**: OK men inte perfekt
   - **8-10**: Bra (jämnt, realistiskt, följer logiska vägar)
3. Lägg till kommentar (valfritt)
4. Klicka **"Spara & Nästa"**

**Tips:**
- Fokusera på helhetsbild, inte enskilda punkter
- Bedöm: Jämnhet, realism, följer vägar/stigar
- Använd "Hoppa över" för oklara fall

### 4. Konvertera till träningsdata

```bash
export DATABASE_URL="postgresql://..."
python ml/train_from_experiments.py
```

Detta skapar `ml/data/experiment_feedback_YYYYMMDD_HHMMSS.json` med:
- **Höga betyg (8-10)**: Korrigeringen används som träningsdata
- **Låga betyg (1-3)**: Ingen korrigering (lär modellen att original var bättre)
- **Mellanbetyg (4-7)**: Ignoreras (för otydliga)

### 5. Träna om modellen

```bash
python ml/analysis.py
```

Modellen tränas nu på:
- Dina exakta manuella korrigeringar (TestLab)
- Experiment-feedback (helhetsbedömningar)

## Databas-schema

```sql
CREATE TABLE ml_experiments (
    id SERIAL PRIMARY KEY,
    track_id INTEGER REFERENCES tracks(id),
    original_track_json JSONB,      -- Original kundspår
    corrected_track_json JSONB,     -- Modellens korrigering
    model_version TEXT,              -- Vilken modell som användes
    rating INTEGER CHECK (1-10),     -- Ditt betyg
    feedback_notes TEXT,             -- Kommentarer
    status TEXT,                     -- pending/rated/skipped
    created_at TIMESTAMP,
    rated_at TIMESTAMP
);
```

## API Endpoints

### Generera batch
```
POST /api/ml/experiments/batch/generate
Response: { generated: 100, total_tracks: 100 }
```

### Hämta nästa experiment
```
GET /api/ml/experiments/next
Response: {
  experiment: { id, track_id, original_track, corrected_track },
  progress: { current: 5, total: 100, rated: 4, remaining: 96 }
}
```

### Spara betyg
```
POST /api/ml/experiments/{id}/rate
Body: { rating: 8, feedback_notes: "Bra jämnhet" }
```

### Hoppa över
```
POST /api/ml/experiments/{id}/skip
```

### Radera alla obedömda (pending)
Tar bort alla rader som räknas som pending (normaliserat med `LOWER(TRIM(status))`). Bedömda (`rated`) och överhoppade (`skipped`) behålls.

**Rekommenderat (fungerar om DELETE blockas av proxy):**
```
POST /api/ml/experiments/purge-pending
Body: {}
Response: { status: "success", deleted: 15, message: "..." }
```

**Alternativ:**
```
DELETE /api/ml/experiments/pending
```

I UI: knappen **"Radera alla obedömda (N)"** anropar POST `purge-pending` först.

### Statistik
```
GET /api/ml/experiments/stats
Response: {
  by_status: { pending: 50, rated: 40, skipped: 10 },
  by_rating: { 1: 2, 2: 3, ..., 10: 5 },
  average_rating: 6.5,
  total: 100
}
```

## Exempel-workflow

```bash
# 1. Migrera databas
export DATABASE_URL="postgresql://..."
python backend/scripts/migrate_ml_experiments.py

# 2. Öppna appen → Experiment → Generera batch
# 3. Bedöm 50-100 spår (tar ~30 min)

# 4. Konvertera feedback till träningsdata
python ml/train_from_experiments.py

# 5. Träna om modellen
python ml/analysis.py

# 6. Testa nya modellen i ML Dashboard
```

## Tips för bedömning

**Ge höga betyg (8-10) när:**
- Spåret ser jämnt och naturligt ut
- Korrigeringen följer logiska vägar/stigar
- Inga konstiga hopp eller kanter
- Realistisk rörelse för en hund

**Ge låga betyg (1-3) när:**
- För mycket korrigering (spåret flyttas för långt)
- För lite korrigering (ingen synlig förbättring)
- Konstiga mönster (sicksack, hopp)
- Spåret ser onaturligt ut

**Ge mellanbetyg (4-7) när:**
- Osäker
- Blandat resultat (vissa delar bra, andra dåliga)
- OK men inte imponerande

## Framtida förbättringar

- **A/B-test**: Visa 2-3 olika korrigeringar, välj bästa
- **Delbetyg**: Jämnhet, realism, väg-följning separat
- **Automatisk bedömning**: Använd högt bedömda spår för att träna en "bedömare-modell"
- **Active Learning**: Modellen väljer vilka spår som behöver bedömas mest
