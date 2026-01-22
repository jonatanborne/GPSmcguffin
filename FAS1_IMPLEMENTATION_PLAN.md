# FAS 1 - Implementeringsplan (Detaljerad)

**Datum:** 2025-01-XX  
**Status:** Planerad - Väntar på godkännande

---

## 📊 Nuvarande Situation (Efter Granskning)

### Databas
- ✅ Systemet stödjer BÅDE PostgreSQL och SQLite
- ✅ PostgreSQL används på Railway (production)
- ✅ SQLite används lokalt om ingen DATABASE_URL finns
- ⚠️ Det finns en `data.db` fil lokalt (kan innehålla testdata)

### Korrigeringar
- ✅ Manuella korrigeringar: Uppdaterar `corrected_lat` och `corrected_lng` via TestLab
- ✅ ML-korrigeringar: Uppdaterar `corrected_lat` och `corrected_lng` via `/ml/apply-correction`
- ⚠️ **Problem:** Ingen tydlig skillnad i databasen mellan manuell och ML-korrigering
- ⚠️ **Lösning:** Vi behöver lägga till `correction_source` kolumn ELLER använda audit_log

### Befintlig Data
- ✅ `track_positions` har redan:
  - `corrected_lat`, `corrected_lng` (kan vara manuell eller ML)
  - `verified_status` ('pending', 'correct', 'incorrect')
  - `corrected_at` (timestamp)
- ❌ Saknas: `truth_level`, `ml_confidence`, `ml_model_version`, `correction_source`

---

## 🎯 Steg 1: Backup & Migration (FÖRST)

### 1.1 Backup-script

**Fil:** `backend/scripts/backup_database.py`

**Funktion:**
- Exportera all data från databasen till JSON-filer
- Fungerar för både PostgreSQL och SQLite
- Skapar timestampade backups

**Vad ska backas upp:**
- Alla tabeller: `tracks`, `track_positions`, `geofences`, `hiding_spots`
- Spara som JSON-filer i `backend/backups/` mapp

**Användning:**
```bash
python backend/scripts/backup_database.py
```

---

### 1.2 Migration-script för databasändringar

**Fil:** `backend/scripts/migrate_fas1.py`

**Funktion:**
- Lägg till nya kolumner i `track_positions`
- Skapa nya tabeller (`audit_log`, `model_versions`, `competitions`)
- Tilldela truth levels till befintlig data
- Fungerar för både PostgreSQL och SQLite

**Databasändringar:**

1. **track_positions:**
   ```sql
   ALTER TABLE track_positions ADD COLUMN truth_level TEXT DEFAULT 'T3';
   ALTER TABLE track_positions ADD COLUMN ml_confidence DOUBLE PRECISION;
   ALTER TABLE track_positions ADD COLUMN ml_model_version TEXT;
   ALTER TABLE track_positions ADD COLUMN correction_source TEXT; -- 'manual' eller 'ml'
   ```

2. **tracks:**
   ```sql
   ALTER TABLE tracks ADD COLUMN competition_id INTEGER;
   ```

3. **Nya tabeller:**
   - `audit_log`
   - `model_versions`
   - `competitions`

**Truth Level Tilldelning (för befintlig data):**

```python
# T0: Manuell annotering (absolut sanning)
# - corrected_lat/lng finns OCH verified_status = 'correct'
# - OCH correction_source = 'manual' (eller corrected_at före ML-implementation)

# T1: Verifierat human track
# - track_type = 'human' OCH verified_status = 'correct'

# T2: ML-korrigerad position
# - corrected_lat/lng finns OCH correction_source = 'ml'
# - OCH ml_confidence > threshold (om confidence finns)

# T3: Rå GPS (default)
# - Alla andra positioner
```

**Användning:**
```bash
python backend/scripts/migrate_fas1.py
```

---

## 🔍 Logik för Truth Level Tilldelning

### För befintlig data (vid migration):

1. **T0 - Manuell annotering:**
   - `corrected_lat` och `corrected_lng` finns
   - `verified_status = 'correct'`
   - `correction_source = 'manual'` (eller `corrected_at` är före första ML-körning)

2. **T1 - Verifierat human track:**
   - `track_type = 'human'`
   - `verified_status = 'correct'`
   - Inga korrigeringar behövs (rå GPS är redan korrekt)

3. **T2 - ML-korrigerad:**
   - `corrected_lat` och `corrected_lng` finns
   - `correction_source = 'ml'`
   - (Om `ml_confidence` finns och > threshold)

4. **T3 - Rå GPS:**
   - Alla andra positioner (default)

### För ny data (efter migration):

- Truth levels tilldelas automatiskt när:
  - Manuell korrigering görs → T0
  - ML-korrigering appliceras → T2
  - Human track verifieras → T1
  - Ny position skapas → T3

---

## 📝 Nästa Steg (Efter Godkännande)

1. **Skapa backup-script** (`backend/scripts/backup_database.py`)
2. **Skapa migration-script** (`backend/scripts/migrate_fas1.py`)
3. **Testa migration lokalt** (med SQLite om det finns testdata)
4. **Kör backup** av production-databas
5. **Kör migration** på production (efter godkännande)

---

## ❓ Frågor som behöver svaras (se FAS1_QUESTIONS.md)

1. Vilken databas använder du just nu? (PostgreSQL/SQLite/båda)
2. Har du testmiljö eller testar vi direkt i production?
3. Hur skiljer vi manuell från ML-korrigering i befintlig data?
4. Truth Level T1 - alla human tracks eller bara verifierade?

---

**Väntar på godkännande innan implementering!**
