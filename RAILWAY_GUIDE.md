# Railway Deployment Guide - Steg för Steg

Följ dessa steg för att deploya din backend till Railway.

## Steg 1: Förberedelser

### 1.1. Pusha koden till GitHub
Om du inte redan har gjort det:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <din-github-repo-url>
git push -u origin main
```

### 1.2. Kontrollera att du har:
- ✅ GitHub-konto
- ✅ Repository med koden
- ✅ Kreditkort (för gratis tier, ingen kostnad om du håller dig under gränsen)

## Steg 2: Skapa Railway-konto och Projekt

### 2.1. Gå till Railway
1. Öppna [railway.app](https://railway.app) i webbläsaren
2. Klicka på **"Login"** eller **"Start a New Project"**
3. Logga in med ditt **GitHub-konto** (rekommenderat - enklast)

### 2.2. Skapa nytt projekt
1. Efter inloggning, klicka på **"New Project"**
2. Välj **"Deploy from GitHub repo"**
3. Välj ditt repository (`dogtracks-geofence-kit`)
4. Railway kommer automatiskt detektera att det är Python

## Steg 3: Konfigurera Railway

### 3.1. Railway detekterar automatiskt
Railway kommer:
- ✅ Detektera att det är Python
- ✅ Hitta `requirements.txt`
- ✅ Hitta `Procfile` eller starta automatisk

### 3.2. Om automatisk deployment inte fungerar
Om Railway inte startar automatiskt:

1. Gå till projektet → **Settings**
2. Under **"Build Command"**: Lämna tomt (eller `pip install -r backend/requirements.txt`)
3. Under **"Start Command"**: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`

### 3.3. Vänta på deployment
- Railway bygger din app (tar 2-5 minuter första gången)
- Du ser loggar i realtid
- När det är klart ser du "Deployment successful"

## Steg 4: Få din URL

### 4.1. Hitta din URL
1. Gå till projektet
2. Klicka på **"Settings"** → **"Domains"**
3. Du ser din URL (t.ex. `https://dogtracks-backend-production.up.railway.app`)
4. **KOPIERA DENNA URL!** Du behöver den för frontend

### 4.2. Testa backend
Öppna din URL + `/ping` i webbläsaren:
```
https://din-url.up.railway.app/ping
```

Du ska se:
```json
{"status": "ok"}
```

## Steg 5: Uppdatera Frontend

### 5.1. Skapa .env-fil
I mappen `frontend/`, skapa en fil som heter `.env`:
```
VITE_API_URL=https://din-url.up.railway.app
```

**VIKTIGT:** Ersätt `https://din-url.up.railway.app` med din riktiga Railway URL!

### 5.2. Om du inte har .env-fil
Från frontend-mappen:
```bash
cd frontend
echo "VITE_API_URL=https://din-url.up.railway.app" > .env
```

### 5.3. Starta om frontend
Stoppa frontend (Ctrl+C) och starta igen:
```bash
npm run dev
```

## Steg 6: Testa Hela Systemet

### 6.1. Testa lokalt (från datorn)
1. Öppna `http://localhost:3000` i webbläsaren
2. Öppna developer console (F12)
3. Testa att skapa ett spår
4. Kolla att inga CORS-fel eller nätverksfel visas

### 6.2. Testa från telefonen (på WiFi)
1. Öppna `http://192.168.x.x:3000` på telefonen (din dators IP)
2. Testa att spårning fungerar
3. Data ska skickas till Railway backend

### 6.3. Testa offline-funktionalitet
1. Stäng av WiFi på telefonen (aktivera mobilt internet)
2. Telefonen är nu på mobilt internet
3. Starta spårning
4. GPS-positioner ska fortfarande skickas till Railway backend! 🎉

## Steg 7: Kontrollera att allt fungerar

### Checklista:
- [ ] Backend svarar på `/ping`
- [ ] Frontend kan skapa spår
- [ ] GPS-positioner sparas
- [ ] Fungerar från telefonen på mobilt internet
- [ ] Spår visas på kartan

## Felsökning

### Problem: "CORS error"
**Lösning:** Kontrollera att CORS är aktiverat i `backend/main.py` (vi har lagt till det)

### Problem: Backend startar inte
**Lösning:** 
- Kolla loggarna i Railway
- Kontrollera att `Procfile` finns i root
- Kontrollera att `requirements.txt` finns i `backend/`

### Problem: Frontend kan inte nå backend
**Lösning:**
- Kontrollera `.env`-filen har rätt URL
- Glöm inte att starta om frontend efter att ändra `.env`
- Testa URL:en manuellt i webbläsaren

### Problem: "502 Bad Gateway"
**Lösning:**
- Backend kanske håller på att starta (vänta 1-2 min)
- Kolla Railway logs för felmeddelanden

## Nästa steg

När allt fungerar:
1. ✅ Testa att göra ett långt spår (flera km)
2. ✅ Testa offline-funktionalitet (gå ut ur WiFi)
3. ✅ Verifiera att alla positioner sparas korrekt

**Grattis! Nu kör din app i molnet! 🚀**

