# Projektgenomgång och städning

*Genererad för att få ordning på projektet och tydlig väg framåt.*

---

## 1. Vad projektet gör (sammanfattning)

| Område | Syfte |
|--------|-------|
| **Geofence Editor** | Rita geofencer, hantera spår, jämföra hund vs människaspår |
| **TestLab** | Manuell GPS-annotering, ML-förutsägelser, batch-adjust, export till ML |
| **ML Dashboard** | Modellinfo, analys, tillämpa korrigering, feedback |
| **Experiment Mode** | Bedöma ML-korrigeringar på kundspår (1–10), träna vidare |
| **Backend** | FastAPI, Postgres, pipelines (data, assessment), ML-laddning |
| **ML-skript** | Träna modell, bygga dataset från kundspår, experiment-feedback |

---

## 2. Röriga delar

### 2.1 Dokumentation (många filer i root)

```
FAS1_*.md (6+ filer)    →  Kan flyttas till docs/fas1/ eller archive/
RAILWAY_*.md (3+ filer) →  docs/railway/ eller archive/
DEPLOYMENT.md, GITHUB_PUSH.md, FIX_API_CONNECTION.md ...
MASTER_PLAN.md, IMPROVEMENT_PLAN.md, SESSION_STATUS.md
```

**Förslag:** Arkivera gamla planer i `archive/`, samla deployment i `docs/DEPLOYMENT.md`.

### 2.2 Backend – main.py (~6700 rader)

- All logik i en fil
- ML-logik borde flyttas till `pipelines/ml_pipeline.py`
- Dubblerad route: `rename-generic` på två ställen (rad ~1330 och ~1493)
- Dubbla API-prefix: `/geofences` och `/api/geofences` – framtida standardisering

### 2.3 Dubbla DB-init-skript

- `backend/scripts/init_database.py` – env-baserad
- `backend/init_postgres.py` – CLI-arg

**Förslag:** Behåll ett, dokumentera vilket som gäller (troligen `init_database.py`).

### 2.4 Pip-artefakt

- `ml/=1.4.0` – ser ut som råkörd pip-output, bör tas bort

### 2.5 Frontend – API_BASE

- Varje komponent definierar `API_BASE` själv
- Kan flyttas till `src/api.js` och importeras

---

## 3. Vad att göra – prioriterat

### Fas 1: Snabba städningar ✅ (klar)

| Åtgärd | Status |
|--------|--------|
| Ta bort `ml/=1.4.0` | ✅ |
| Ta bort dubbel `rename-generic`-route | ✅ |
| Arkivera FAS1_* och RAILWAY_* till archive/fas1 och archive/railway | ✅ |

### Fas 2: Dokumentationsstädning ✅ (klar)

- FAS1_* och RAILWAY_* redan i archive/ (Fas 1)
- Uppdatera `docs/CONTEXT.md` – SQLite → Postgres ✅
- HuvudREADME uppdaterad med länkar till docs ✅

### Fas 3: Kodstruktur (större jobb)

- Flytta ML-logik från `main.py` till `ml_pipeline.py`
- Slå ihop eller tydliggör de två init-skripten
- Eventuellt centralisera API_BASE i frontend

### Fas 4: Framåt enligt PLAN_EGNA_VS_KUNDSPAR

- Fas A–D enligt dokumentet (track_source, import, filter, batch)
- Experiment Mode är redan igång – nästa steg är mer kundspår och träning

---

## 4. Rekommenderad ordning

1. **Nu:** Fas 1 (snabbstädning)
2. **Sedan:** Dokumentationsstädning (Fas 2) – gör det enklare att navigera
3. **Längre sikt:** Fas 3 om main.py börjar kännas olidlig
4. **Produkt:** Fokusera på PLAN_EGNA_VS_KUNDSPAR och experiment-flödet

---

## 5. Översikt av viktiga filer

```
dogtracks-geofence-kit/
├── backend/
│   ├── main.py           # Huvudfil, allt rör in hit
│   ├── run.py            # Entry point
│   ├── pipelines/        # data, assessment, ml (stub)
│   ├── utils/            # gps_filter, track_comparison
│   └── scripts/          # backup, restore, migrate, import, truncate, init...
├── frontend/
│   └── src/components/
│       ├── GeofenceEditor.jsx   # Karta, spår, geofencer
│       ├── TestLab.jsx          # Annotering, ML, batch
│       ├── MLDashboard.jsx      # Modell, analys, feedback
│       └── ExperimentMode.jsx   # Bedöm experiment
├── ml/
│   ├── analysis.py              # Träna modell
│   ├── build_dataset_from_imported_tracks.py
│   ├── train_from_experiments.py
│   └── output/*.pkl             # Modellfiler (laddas av backend)
├── docs/
│   ├── PLAN_EGNA_VS_KUNDSPAR.md  # Din huvudplan
│   ├── CONTEXT.md, API.md, PIPELINES.md...
│   └── PROJEKTGENOMGANG_OCH_STADNING.md  # Denna fil
└── archive/old_plans/           # Gamla planer
```

---

## 6. Vad vi *inte* ska ta bort (ännu)

- **Backups** – behålls för restore
- **ml/predictions/** – sparade prediction-filer
- **ml/data/** – träningsdata
- **GeofenceEditor, TestLab, MLDashboard** – kärnkomponenter
