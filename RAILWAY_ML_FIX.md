# Railway: Fixa 404 på /ml/model-info och /ml/analyze

**Problem:** Backend hittar inte `ml/` (modell, analysis.py) → 404.

**Orsak:** Railway deployar bara `backend/` (Root Directory = `backend/`). Då finns inte `ml/` i containern.

**Lösning:** Deploya **hela repot** (repo root) och starta med `python backend/run.py`.

---

## Steg 1: Öppna Railway

1. Gå till [railway.app](https://railway.app) och logga in (i vanlig webbläsare, inte Cursor).
2. Öppna ditt projekt → välj **backend**-servicen (den som kör FastAPI).

---

## Steg 2: Root Directory

1. Gå till **Settings** (kugghjulet) för backend-service.
2. Hitta **"Root Directory"** / **"Source"** / **"Watch Paths"** (namnet varierar).
3. **Ändra till:**
   - **Tom** (empty), **eller**
   - **`.`** (punkt = repo root)
4. Om det står `backend` eller `backend/` → **ta bort** det så att root = hela repot.

---

## Steg 3: Build & Start

Railway använder ofta **Procfile** i root. Kontrollera:

1. **Build Command** (om du har custom):
   - Tom **eller**  
   - `pip install -r backend/requirements.txt`
2. **Start Command** (om du har custom):
   - **Antingen:** lämna tom så att **root-Procfile** används:  
     `web: python backend/run.py`
   - **Eller:** sätt explicit:  
     `python backend/run.py`

**VIKTIGT:** Start Command ska **inte** vara `cd backend && uvicorn main:app ...` eller `uvicorn main:app` från `backend/` som working directory, eftersom vi då brukar deploya från `backend/` och sakna `ml/`.

---

## Steg 4: Spara och redeploy

1. Spara inställningarna.
2. Trigga **Redeploy** (Deployments → ... → Redeploy) om det inte bygger automatiskt.

---

## Steg 5: Verifiera

Efter deploy:

1. **Felsök först:** Öppna `https://<din-railway-url>/ml/debug` i webbläsaren.
   - Du ska få **200** med JSON som visar `ml_root_exists`, `model_info_exists`, `analysis_py_exists` osv.
   - Om `ml_root_exists` är `false` → `ml/` finns inte i containern (Root Directory eller Docker build context fel).
2. Öppna `https://<din-railway-url>/ml/model-info`.
   - Du ska få **200** med modellinfo, inte 404.
3. I ML Dashboard: **"Kör ML-analys"** ska inte ge 404.

---

## Sammanfattning

| Inställning    | Rätt värde                    |
|----------------|-------------------------------|
| Root Directory | Tom eller `.` (repo root)     |
| Start Command  | `python backend/run.py`       |

Då deployas `backend/` **och** `ml/` → backend hittar modell + analysis.py.

---

## Om Railway använder Dockerfile

Dockerfile använder en **multi-stage build** som hämtar LFS åt dig:

1. **Stage 1 (lfs):** Alpine + git + git-lfs. `COPY . .` → `git lfs install && git lfs pull` så att `ml/output/*.pkl` blir riktiga filer.
2. **Stage 2 (app):** `COPY --from=lfs /src/backend` och `COPY --from=lfs /src/ml` in i Python-imagen.

Så länge Railway bygger med denna Dockerfile (och build-context inkluderar `.git`), hämtas LFS automatiskt och predict ska fungera. Om du fortfarande får 503 "LFS-pekare", kontrollera att Root Directory är tom eller `.` (repo root) så att hela repot inkl. `.git` finns i build-context.

---

## Git LFS och fel vid ML-förutsägelse (503 / UnpicklingError)

**Symptom:** `/ml/predict`, `/ml/predict/multiple` eller `/ml/apply-correction` ger **500** med  
`_pickle.UnpicklingError: invalid load key, 'v'` (eller 503 med tydligt meddelande om LFS-pekare).

**Orsak:** Modellfilerna (`.pkl`) ligger i **Git LFS**. Vid deploy finns i repot bara **LFS-pekare** (små textfiler som börjar med `version https://git-lfs...`). Backend försöker läsa dessa som pickle → krasch. På Railway hämtas ofta inte LFS vid build.

**Lösning:** LFS-filer måste hämtas innan eller under build.

1. **Dockerfile (rekommenderat):** Denna repo använder en multi-stage Dockerfile som kör `git lfs install && git lfs pull` i en tidig stage. Så länge Railway bygger med den Dockerfilen och root = repo root (så att `.git` finns i build-context), hämtas `.pkl` automatiskt.
2. **Alternativ – före Docker-build:** Kör **`git lfs pull`** i repot innan build. Om du bygger lokalt eller med egen CI, gör det i samma katalog som Dockerfile.
3. **Om du lägger till .dockerignore:** Exkludera inte `.git` eller `ml/` – LFS-steget behöver dem.
4. **Snabb kontroll:** `GET /ml/debug`. Om `model_info_exists` är true men predict ger 503 "LFS-pekare", har `.pkl` inte hämtats vid deploy (t.ex. build-context saknar `.git` eller Dockerfile används inte).

Backend returnerar nu **503** med ett tydligt meddelande när den upptäcker LFS-pekare istället för att krascha med UnpicklingError.
