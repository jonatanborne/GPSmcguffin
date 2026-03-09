# Arkiv-kontroll – inget saknas

## 1. Vad vi arkiverade (Fas 1)

| Fil | Ny plats | Inre referenser |
|-----|----------|-----------------|
| FAS1_*.md (8 st) | archive/fas1/ | Refererar till varandra med filnamn – alla i samma mapp, fungerar |
| RAILWAY_*.md (4 st) | archive/railway/ | Inga kända inre referenser |

## 2. Externa referenser till arkiverade filer

| Var | Referens | Status |
|-----|----------|--------|
| **backend/main.py** rad ~3383 | "Se RAILWAY_ML_FIX.md" | ⚠️ Länken pekar på gammal plats – uppdatera till archive/railway/RAILWAY_ML_FIX.md |
| README.md | archive/railway/RAILWAY_GUIDE.md | ✅ Länken redan uppdaterad |
| docs/CONTEXT.md | QUICK_START.md, DEPLOYMENT.md | ✅ Pekar på root – filerna ligger kvar där |
| archive/fas1/FAS1_PROGRESS_SUMMARY.md | RAILWAY_ML_FIX.md | Info i arkiv – användaren kan söka i archive/railway/ |

## 3. Filer vi INTE arkiverar (ligger kvar i root)

Dessa ska inte flyttas – de används aktivt:

- README.md
- QUICK_START.md
- DEPLOYMENT.md
- EXPERIMENT_MODE_QUICKSTART.md
- TEST_INSTRUCTIONS.md
- docs/CONTEXT.md (nämner dem)
- MASTER_PLAN, IMPROVEMENT_PLAN, SESSION_STATUS, etc. – kan arkiveras senare om du vill

## 4. Åtgärd kvar

Uppdatera `backend/main.py` så att felmeddelandet pekar på rätt fil:
`RAILWAY_ML_FIX.md` → `archive/railway/RAILWAY_ML_FIX.md`
