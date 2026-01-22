# FAS 1 - Truth Levels Specifikation (Slutgiltig)

**Datum:** 2025-01-22  
**Status:** Godkänd - Klar för implementation

---

## 📊 Truth Levels Översikt

| Nivå | Källa                                | Användning           |
| ---- | ------------------------------------ | -------------------- |
| T0   | Manuell TestLab-annotering           | Absolut ground truth |
| T1   | Human track (verifierad, ej ML-korr) | Referens             |
| T2   | ML-korrigerad position (human/dog)   | Prediktion           |
| T3   | Rå GPS                               | Endast rådata        |

---

## 🎯 Detaljerade Regler

### T0 - Manuell TestLab-annotering (Absolut Ground Truth)

**När sätts T0:**
- När `correction_source = 'manual'`
- När korrigering görs i TestLab OCH positionen faktiskt flyttats (> 1 meter)
- Avståndet mellan original och corrected position måste vara > 1 meter

**Krav:**
- `correction_source` kolumn måste finnas
- T0 = högsta auktoritet, används som ground truth för ML-träning
- Positionen måste ha flyttats faktiskt (inte bara markerad som "korrekt")

**Viktigt:**
- ML-korrigering får ALDRIG bli T0
- T0 är alltid manuell korrigering där positionen flyttats
- Om positionen var korrekt från början (avstånd < 1 meter) → T1 (inte T0)

---

### T1 - Verifierat Track (Referens, korrekt från början)

**När sätts T1:**
- När `verified_status = 'correct'` OCH positionen var korrekt från början
- Positionen har INTE flyttats (ingen korrigering ELLER korrigering < 1 meter)
- Gäller för både human OCH dog tracks

**Regel:**
```sql
IF verified_status = 'correct' 
   AND (
     -- Inga korrigeringar alls
     (corrected_lat IS NULL AND corrected_lng IS NULL)
     OR
     -- Korrigeringar finns men avståndet är < 1 meter (var korrekt från början)
     (corrected_lat IS NOT NULL AND corrected_lng IS NOT NULL 
      AND haversine_distance(original, corrected) <= 1.0)
   )
   AND (correction_source IS NULL OR correction_source != 'ml') THEN
    truth_level = 'T1'
END IF
```

**Viktigt:**
- T1 = position som var korrekt från början (inte flyttad)
- Om positionen flyttats > 1 meter → T0 (inte T1)
- Om ML korrigerar → T2 (inte T1)
- Gäller för både human och dog tracks

**Varför:**
- ML-modellen behöver lära sig vad som var korrekt från början
- Positioner som inte flyttats är värdefulla träningsdata
- Skillnaden mellan T0 och T1: T0 = flyttad, T1 = korrekt från början

---

### T2 - ML-korrigerad Position (Prediktion)

**När sätts T2:**
- Så fort ML har producerat en korrigering
- OAVSETT om det är human track eller dog track
- OAVSETT confidence-threshold
- När `correction_source = 'ml'`

**Regel:**
```sql
IF correction_source = 'ml' THEN
    truth_level = 'T2'
    ml_confidence = <0..1>
    ml_model_version = 'x.y.z'
    -- Oavsett track_type (kan vara 'human' eller 'dog')
END IF
```

**Viktigt:**
- T2 = ML-källa, INTE "bra ML"
- T2 kan gälla för BÅDE human tracks OCH dog tracks
- GPS kan ha fel oavsett vem som bär enheten
- ML-modellen ska kunna korrigera både human och dog tracks
- Confidence-threshold används för `usable_for_scoring`, INTE för truth level
- Låg confidence är fortfarande värdefull (debug, active learning, visualisering)

**Separera kvalitet från källa:**
- `truth_level = T2` → ML har korrigerat (human eller dog)
- `usable_for_scoring = (ml_confidence >= threshold)` → Får användas i bedömning

---

### T3 - Rå GPS (Default)

**När sätts T3:**
- Alla positioner som inte är T0, T1, eller T2
- Default för nya positioner
- Overifierade human tracks

**Regel:**
```sql
IF truth_level IS NULL THEN
    truth_level = 'T3'  -- Default
END IF
```

---

## 🗄️ Databasändringar

### Nya kolumner i `track_positions`:

```sql
-- Truth level (T0, T1, T2, T3)
ALTER TABLE track_positions 
ADD COLUMN truth_level TEXT DEFAULT 'T3' 
CHECK (truth_level IN ('T0', 'T1', 'T2', 'T3'));

-- Correction source (manual, ml, none)
ALTER TABLE track_positions 
ADD COLUMN correction_source TEXT DEFAULT 'none'
CHECK (correction_source IN ('manual', 'ml', 'none'));

-- ML confidence (0.0 - 1.0)
ALTER TABLE track_positions 
ADD COLUMN ml_confidence DOUBLE PRECISION;

-- ML model version
ALTER TABLE track_positions 
ADD COLUMN ml_model_version TEXT;

-- Usable for scoring (baserat på confidence + regler)
ALTER TABLE track_positions 
ADD COLUMN usable_for_scoring BOOLEAN DEFAULT FALSE;

-- (Valfritt) Annotated by / Corrected by
ALTER TABLE track_positions 
ADD COLUMN corrected_by TEXT;
```

---

## 🔄 Migration-logik för Befintlig Data

### Steg 1: Tilldela Truth Levels

```python
# T1: Verifierade human tracks (som INTE är ML-korrigerade)
UPDATE track_positions tp
JOIN tracks t ON tp.track_id = t.id
SET tp.truth_level = 'T1'
WHERE t.track_type = 'human' 
  AND tp.verified_status = 'correct'
  AND (tp.correction_source IS NULL OR tp.correction_source != 'ml');

# T2: ML-korrigeringar (human OCH dog tracks)
# Problemet: Vi kan inte skilja manuell från ML i befintlig data
# Lösning: Sätt till T3 för befintlig data, låt systemet sätta T2 för nya ML-korrigeringar
# När ML körs framöver kommer systemet automatiskt sätta T2

# T0: Manuella korrigeringar (om vi kan identifiera dem)
# Problemet: Vi kan inte skilja manuell från ML i befintlig data
# Lösning: Sätt till T3 för befintlig data, låt användare uppdatera i TestLab

# T3: Allt annat (default)
UPDATE track_positions
SET truth_level = 'T3'
WHERE truth_level IS NULL;
```

### Steg 2: Sätt Correction Source

```python
# Om corrected_lat/lng finns men vi inte vet källan:
# Sätt till 'none' (eller 'unknown') för befintlig data
UPDATE track_positions
SET correction_source = 'none'
WHERE correction_source IS NULL 
  AND (corrected_lat IS NOT NULL OR corrected_lng IS NOT NULL);

# För nya korrigeringar kommer systemet sätta:
# - correction_source = 'manual' när TestLab korrigerar
# - correction_source = 'ml' när ML korrigerar
```

---

## 🎯 Sanningstabell (Implementation Guide)

| Villkor | truth_level | correction_source | track_type | usable_for_scoring |
|---------|-------------|------------------|------------|-------------------|
| Rå GPS, ingen korrigering | T3 | 'none' | human/dog | FALSE |
| Human track, verified, ej ML-korr | T1 | 'none' | human | TRUE |
| Human track, inte verified | T3 | 'none' | human | FALSE |
| Dog track, verified | T3 | 'none' | dog | FALSE |
| TestLab manuell korrigering | T0 | 'manual' | human/dog | TRUE |
| ML korrigering human, conf >= 0.8 | T2 | 'ml' | human | TRUE |
| ML korrigering human, conf < 0.8 | T2 | 'ml' | human | FALSE |
| ML korrigering dog, conf >= 0.8 | T2 | 'ml' | dog | TRUE |
| ML korrigering dog, conf < 0.8 | T2 | 'ml' | dog | FALSE |

---

## ✅ Implementation Checklist

- [ ] Lägg till `truth_level` kolumn
- [ ] Lägg till `correction_source` kolumn
- [ ] Lägg till `ml_confidence` kolumn
- [ ] Lägg till `ml_model_version` kolumn
- [ ] Lägg till `usable_for_scoring` kolumn
- [ ] (Valfritt) Lägg till `corrected_by` kolumn
- [ ] Migration-script för befintlig data
- [ ] Uppdatera TestLab för att sätta `correction_source = 'manual'`
- [ ] Uppdatera ML-endpoints för att sätta `correction_source = 'ml'` (både human OCH dog tracks)
- [ ] Uppdatera ML-modellen för att kunna korrigera både human och dog tracks
- [ ] Uppdatera API:er för att returnera truth levels
- [ ] Uppdatera frontend för att visa truth levels

---

## 📝 Viktiga Beslut

1. **Truth levels = källa, inte kvalitet**
   - T2 betyder "ML har korrigerat", inte "bra ML"
   - Kvalitet hanteras via `usable_for_scoring`

2. **Tappar inte data**
   - Låg confidence är fortfarande värdefull
   - Används för debug, active learning, visualisering

3. **Befintlig data:**
   - Kan inte skilja manuell från ML i befintlig data
   - Sätt till T3 för korrigerade positioner utan källa
   - Låt systemet sätta rätt truth level för nya korrigeringar

4. **Migration-vänligt:**
   - Lägg till kolumner med defaults
   - Backfilla med säkra värden
   - Låt användare uppdatera vid behov

---

**Godkänt för implementation!** ✅
