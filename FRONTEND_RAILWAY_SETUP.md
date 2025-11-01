# Så här lägger du till Frontend i Railway

## Problem
Du har bara backend deployad. Du behöver också en frontend-service för att få HTTPS.

## Steg-för-steg:

### Steg 1: Lägg till ny service
1. I Railway Dashboard → Ditt projekt
2. Klicka på **"+"** eller **"New"** uppe till höger i projektet
3. Välj **"GitHub Repo"**
4. Välj: `jonatanborne/GPSmcguffin`
5. Railway lägger till en ny service

### Steg 2: Konfigurera Root Directory
1. Klicka på den **nya servicen** (den som precis skapades)
2. Gå till **"Settings"**
3. Scrolla ner till **"Root Directory"**
4. Skriv: `frontend`
5. Spara

### Steg 3: Sätt miljövariabel
1. Gå till **"Variables"** (i Settings eller i service-vyn)
2. Klicka **"+ New Variable"**
3. Key: `VITE_API_URL`
4. Value: `https://web-production-dc9e.up.railway.app`
5. Spara

### Steg 4: Kontrollera Build/Start Commands
Railway borde automatiskt detektera:
- Build: `npm install && npm run build`
- Start: `npm run preview`

Om det inte fungerar automatiskt:
- Gå till Settings → Deploy
- Build Command: `npm install && npm run build`
- Start Command: `npm run preview`

### Steg 5: Vänta på deployment
- Railway bygger frontend (tar 2-3 minuter)
- När det är klart får du en **ny HTTPS-URL** för frontend

### Steg 6: Testa
- Öppna frontend-URL:en på telefonen
- GPS ska nu fungera! (eftersom det är HTTPS)

## Om du inte ser "New" knappen:

1. Klicka på ditt projekt-namn
2. I projektet, klicka på **"..."** (tre prickar) eller **"Add Service"**
3. Följ samma steg som ovan

## Du kommer att ha:
- **Backend**: `https://web-production-dc9e.up.railway.app`
- **Frontend**: `https://web-production-XXXX.up.railway.app` (ny URL)

Båda är HTTPS och fungerar överallt! 🎉

