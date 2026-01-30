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

## Git LFS och fel vid ML-förutsägelse (503 / UnpicklingError)

**Symptom:** `/ml/predict`, `/ml/model-info` etc. ger **503** eller **500** med  
`_pickle.UnpicklingError: invalid load key, 'v'` (eller meddelande om LFS-pekare).

**Orsak:** `.pkl`-filerna ligger i **Git LFS**. Railway **stödjer inte** att hämta LFS vid Docker-build. Vid build får containern bara LFS-pekare, inte riktiga modellfiler → 503 vid predict.

---

### Lösning: Bygg i GitHub Actions, deploya från GHCR

Vi bygger Docker-imagen i **GitHub Actions** (där `git lfs pull` fungerar), pushar till **GitHub Container Registry (GHCR)**, och låter **Railway deploya från den imagen** istället för att bygga från repot.

1. **Workflow:** `.github/workflows/build-push-ghcr.yml`  
   - Triggas vid push till `main`.  
   - Checkout med LFS → `git lfs pull` → `docker build` → push till `ghcr.io/<owner>/gpsmcguffin:latest`.

2. **Railway – byt till "Deploy from Docker image":**
   - Öppna din **web**-service → **Settings**.
   - Under **Source**: koppla bort nuvarande GitHub-repo (eller behåll för triggers – se nedan).
   - **Lägg till / byt till "Docker Image" som deploy-källa.**  
     Image:  
     `ghcr.io/jonatanborne/gpsmcguffin:latest`
   - Spara. Railway deployar nu från GHCR-imagen istället för att bygga från repo.

3. **Variabler:** Behåll befintliga (t.ex. `DATABASE_URL`, `PORT`). De påverkar bara containern vid start, inte build.

4. **Uppdateringar:** Vid varje push till `main` körs Actions → ny image pushas till `:latest` → Railway kan redeploya (beroende på inställningar) för att ta den nya imagen.

5. **GHCR-paket publikt (om Railway inte har auth):** Gå till GitHub → **Packages** → `gpsmcguffin` → **Package settings** → **Change visibility** → **Public**, så att Railway kan hämta imagen utan inloggning.

**Viktigt:** Om du byggt **från repo** tidigare (Dockerfile) måste du explicit **ändra** servicen till att använda **Docker Image** `ghcr.io/jonatanborne/gpsmcguffin:latest`. Då körs ingen build på Railway och LFS-problemet försvinner.

---

### Alternativ: Volume + manuell upload

Om du vill undvika GHCR kan du använda en **Railway Volume**: deploya t.ex. filebrowser-template, ladda upp `.pkl` till volumet, koppla volumet till web-servicen och läsa modellfilerna därifrån. Mer manuellt vid modelluppdateringar. Se Railways dokumentation om volumes.

---

Backend returnerar **503** med tydligt meddelande när den upptäcker LFS-pekare istället för att krascha med UnpicklingError.
