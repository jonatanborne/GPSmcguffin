# Fixa API-anslutning mellan Frontend och Backend

## Problem
Frontend kan inte nå backend, så spårning fungerar inte.

## Lösning: Sätt Environment Variable på Frontend-tjänsten

### Steg 1: Hitta din Backend-URL
1. Öppna Railway Dashboard
2. Gå till din **backend-tjänst**
3. Öppna **"Settings"**
4. Scrolla ner till **"Domains"** eller kolla överst i tjänsten
5. Din backend-URL ser ut som: `https://web-production-XXXX.up.railway.app`
   - Eller: `https://[tjänst-namn].up.railway.app`

### Steg 2: Sätt Environment Variable på Frontend
1. Gå till din **frontend-tjänst** i Railway
2. Öppna **"Variables"** (i vänstermenyn eller under Settings)
3. Klicka **"+ New Variable"**
4. **Key:** `VITE_API_URL`
5. **Value:** Din backend-URL från steg 1 (exakt, med `https://`)
   - T.ex: `https://web-production-dc9e.up.railway.app`
6. Klicka **"Add"** eller **"Save"**

### Steg 3: Redeploy Frontend
**VIKTIGT:** Efter att du lagt till environment variable måste du redeploya frontend eftersom Vite läser in variabler vid build-tid.

1. I frontend-tjänsten, gå till **"Deployments"**
2. Klicka på **"Redeploy"** på senaste deployment
   - ELLER
3. Gå till **"Settings"** → **"Deploy"** → **"Redeploy"**

### Steg 4: Vänta på ny deployment
- Railway bygger om frontend med rätt API-URL
- Tar 2-3 minuter

### Steg 5: Testa igen
1. Öppna din frontend-URL
2. Öppna Browser DevTools (F12) → Console
3. Försök starta spårning
4. Kolla om det finns fel i Console

## Verifiera att det fungerar

### I Browser Console:
Om det fungerar ska du se:
- Inga fel när sidan laddas
- När du startar spårning: inga CORS-fel eller 404-fel

Om det inte fungerar:
- Fel som `Network Error` eller `CORS` → Backend-URL är fel
- Fel som `404 Not Found` → Backend körs inte eller URL är fel
- Fel som `Cannot read property...` → JavaScript-fel, annat problem

## Vanliga problem

### "VITE_API_URL is not defined"
- Du glömde redeploya frontend efter att ha lagt till variabeln
- Redeploya frontend-tjänsten

### "Network Error" eller CORS-fel
- Kontrollera att backend-URL:en är korrekt (med `https://`)
- Kontrollera att backend körs (gå till backend-URL + `/ping`)

### Frontend körs men kan inte skapa spår
- Kolla Browser Console för fel
- Kolla Railway logs för backend-tjänsten

