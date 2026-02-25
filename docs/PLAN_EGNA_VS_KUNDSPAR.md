# Plan: Egna spår vs kundspår (import från uppdragsgivare)

**Syfte:** Tydlig uppdelning mellan spår du skapat själv i systemet och spår som importerats från uppdragsgivarens export (CSV), så att vi kan använda båda på rätt sätt utan att blanda ihop dem.

---

## 1. Begrepp och mål

| Term | Betydelse |
|------|-----------|
| **Egna spår** | Spår skapade i vårt program (Geofence Editor / TestLab / API). Används för daglig användning, ML-träning du kontrollerar, och domarverktyg. |
| **Kundspår** | Spår importerade från uppdragsgivarens export (t.ex. `Dogtracks_20251119_Tracks_*.csv`). Används för validering, träningsdata och jämförelse/statistik – utan att ändra eller ta bort dina egna spår. |

**Mål:**
- Kunna importera kundens ~100 spårpar till samma databas.
- I UI och API alltid kunna filtrera/skilja: “bara egna”, “bara kundspår”, “alla”.
- Använda kundspåren för att göra programmet bättre (ML, trösklar, jämförelse) utan att blanda med egna spår i rapporter eller träning om vi inte vill.

---

## 2. Teknisk uppdelning

### 2.1 Markera spårens ursprung i databasen

- **Förslag:** Lägg till kolumnen `track_source` på tabellen `tracks`.
  - Värden: `'own'` (egna) | `'imported'` (kundspår från CSV).
  - Default för nya spår som skapas i appen: `'own'`.
  - Endast import-skriptet sätter `'imported'` när det skapar spår från CSV.

- **Filer att uppdatera:**
  - Migrering (t.ex. `backend/scripts/migrate_fas1.py` eller ny migration): `ALTER TABLE tracks ADD COLUMN track_source TEXT DEFAULT 'own'`.
  - `backend/main.py`: vid `CREATE TABLE tracks` lägg till `track_source`; vid skapande av spår via API använd `track_source = 'own'`; vid `GET /tracks` (och liknande) returnera `track_source` så frontend kan filtrera.
  - `backend/init_postgres.py`: lägg till `track_source` i `CREATE TABLE tracks` för nya installationer.

- **Index (valfritt):** `CREATE INDEX idx_tracks_track_source ON tracks(track_source)` för snabb filtrering.

### 2.2 Kundspår-import (CSV → databas)

- **Indata:** De tre CSV-filerna du bifogat:
  - `Dogtracks_20251119_Tracks_Header.csv` — kolumner: `Id, Name, PersonTrack, DogTrack`.
  - `Dogtracks_20251119_Tracks_Person.csv` — kolumner: `TrackId, Latitude, Longitude, TimeStamp`.
  - `Dogtracks_20251119_Tracks_Dog.csv` — samma struktur som Person.

- **Regler:**
  - Varje rad i Header = ett “case” med ett människaspår och ett hundspår.
  - Person/Dog-CSV använder **komma som decimal** i koordinater; dessa ska konverteras till punkt (t.ex. `56,765...` → `56.765...`).
  - Timestamp: parsa enligt formatet i filen (t.ex. `2025-01-01 08:50:59.0000000`).

- **Import-logik (skript):**
  1. Läs Header-CSV; för varje rad:
     - Skapa ett spår för människans spår: `track_type='human'`, `name` från Header (t.ex. Name eller Id), `track_source='imported'`. Spara genererat eller mappat `id` för PersonTrack.
     - Skapa ett spår för hundens spår: `track_type='dog'`, `human_track_id` = människaspårets id, `track_source='imported'`. Spara id för DogTrack.
  2. Läs Person-CSV; gruppera rader per `TrackId`; för varje position: `INSERT INTO track_positions (track_id, position_lat, position_lng, timestamp, ...)` med track_id = det id vi gav det människaspåret vid import.
  3. Samma för Dog-CSV mot hundspårens id:n.

- **ID-hantering:** CSV använder egna ID:n (t.ex. 158064, 158063). Vi kan antingen:
  - **A)** Använda dessa som externa referenser och låta databasen generera nya id:n (då behåller vi en mappningsfil eller tabell TrackId CSV → track.id), eller  
  - **B)** Om databasen tillåter (t.ex. SERIAL/IDENTITY), försöka sätta id vid INSERT för att behålla CSV-id:n – kräver att id:n inte krockar med egna spår.

- **Rekommendation:** Generera nya id:n i databasen och spara i import-skriptet en liten mappning (CSV PersonTrack/DogTrack → track.id) så att vi kan rapportera “importerat från case X”.

- **Placering:** Ett nytt skript t.ex. `backend/scripts/import_dogtracks_csv.py` som tar sökvägar till de tre CSV-filerna (och ev. databas-URL) som argument. Skriptet ska vara idempotent eller köras en gång per leverans (om samma CSV körs igen, antingen hoppa över redan importerade eller använd “batch-namn” för att undvika dubbletter).

### 2.3 API och listor

- **GET /tracks (och liknande list-endpoints):**
  - Returnera alltid `track_source` för varje spår.
  - **Filtrering:** Ny query-parameter t.ex. `track_source=own|imported` så att frontend kan visa “bara egna”, “bara kundspår” eller “alla”.

- **Jämförelse/ML:**  
  - Compare-, segment- och DTW-endpoints behöver inte ändras i sig; de jobbar på track_id.  
  - Om vi senare vill “träna bara på kundspår” eller “räkna statistik bara på egna”, görs det genom att filtrera vilka track_id:n som skickas in eller genom att backend filtrerar på `track_source` om vi lägger till t.ex. “batch compare” eller “export för träning”.

---

## 3. Frontend (UI)

- **Spårlistor (Geofence Editor, TestLab, ML Dashboard):**
  - Filter eller flikar: **Egna spår** | **Kundspår** | **Alla**.
  - Visuell markering (t.ex. ikon eller etikett “Importerad” / “Kund”) så att man ser vilka som är kundspår.

- **Skrivskydd för kundspår (valfritt, senare):**  
  Om vi vill förhindra att kundspår rättas eller raderas av misstag kan vi i UI (och ev. backend) för spår med `track_source='imported'`:
  - dölja eller inaktivera “radera spår” / “redigera namn”, och/eller  
  - tillåta jämförelse och export men inte korrigering av positioner.  
  Detta kan vara Fas 2.

---

## 4. Användning av kundspår för att göra programmet bättre

- **Statistik och trösklar:**  
  Köra punkt-/segment-/DTW-jämförelse på alla importerade spårpar. Samla fördelning av matchning %, segmentlikhet, DTW-score. Använd detta för att justera trösklar och scoring i våra pipelines.

- **ML-träning/validering:**  
  Kundspåren kan användas som valideringsset eller som extra träningsdata. Då är det viktigt att tränings-/export-pipelinen kan välja “bara egna”, “bara kundspår” eller “blandat” så att du har kontroll.

- **Rapporter:**  
  Om vi lägger till enkel rapportering (t.ex. “genomsnittlig matchning per spår”), ska vi kunna filtrera på `track_source` så att “egna” och “kundspår” kan rapporteras var för sig.

---

## 5. Implementeringsordning (fasindelning)

| Fas | Innehåll | Spår som påverkas |
|-----|----------|--------------------|
| **Fas A** | Lägg till `track_source` i databas och API; sätt default `'own'` för alla befintliga och nya egna spår. | Egna spår (oförändrade; får `track_source='own'`). |
| **Fas B** | Skapa import-skript som läser de tre CSV-filerna och skapar spår + positioner med `track_source='imported'`. | Nya kundspår skapas. |
| **Fas C** | Frontend: filter/visning “Egna” / “Kundspår” / “Alla” i spårlistor och tydlig markering av kundspår. | Egna och kundspår visas uppdelat. |
| **Fas D** | (Valfritt) Batch-jämförelse/export som respekterar `track_source` för ML och statistik. | Användning av båda datamängderna enligt val. |

---

## 6. Sammanfattning

- **Egna spår** = skapade i appen, `track_source='own'`.  
- **Kundspår** = importerade från uppdragsgivarens CSV, `track_source='imported'`.  
- Allt bygger på en gemensam `tracks`/`track_positions`-modell med en extra kolumn och tydliga filter i API och UI, så att vi kan implementera och använda båda datamängderna utan att blanda ihop dem.

När du vill kan vi gå fas för fas och implementera (migrering → import-skript → API-filter → frontend-filter).
