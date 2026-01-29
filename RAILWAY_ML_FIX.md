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

Vi har uppdaterat `Dockerfile` så att den kopierar `ml/` in i imagen. Om du bygger med Dockerfile måste **Git LFS**-filerna vara tillgängliga vid build (t.ex. `git lfs pull` innan `docker build`). Om du bara använder Procfile + Nixpacks behöver du inte tänka på LFS vid build.

---

## Git LFS och fel vid ML-förutsägelse (503 / UnpicklingError)

**Symptom:** `/ml/predict`, `/ml/predict/multiple` eller `/ml/apply-correction` ger **500** med  
`_pickle.UnpicklingError: invalid load key, 'v'` (eller 503 med tydligt meddelande om LFS-pekare).

**Orsak:** Modellfilerna (`.pkl`) ligger i **Git LFS**. Vid deploy finns i repot bara **LFS-pekare** (små textfiler som börjar med `version https://git-lfs...`). Backend försöker läsa dessa som pickle → krasch. På Railway hämtas ofta inte LFS vid build.

**Lösning:** Se till att LFS-filer **hämtas** innan build. Build-context (det som `COPY ml/` tar från) kommer från där `docker build` körs.

1. **Före Docker-build:** Kör **`git lfs pull`** i repot (samma katalog som Dockerfile) innan du bygger. Då blir `ml/output/*.pkl` riktiga binärfiler istället för LFS-pekare, och `COPY ml/` i Dockerfile kopierar dem.
2. **Railway / CI:** Om Railway eller annan CI kör `docker build`, måste steget som bygger imagen antingen köra `git lfs install` och `git lfs pull` innan build, eller använda en buildpack/image som gör det. Utan det får imagen bara pekare → 503 vid predict.
3. **Snabb kontroll:** Öppna `GET /ml/debug`. Om `model_info_exists` är true men predict ger 503 med "LFS-pekare", är orsaken att `.pkl` inte hämtats vid deploy.

Backend returnerar nu **503** med ett tydligt meddelande när den upptäcker LFS-pekare istället för att krascha med UnpicklingError.
