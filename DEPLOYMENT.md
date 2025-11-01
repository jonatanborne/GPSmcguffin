# Cloud Deployment Guide

Denna guide visar hur du deployar backend till molnet så att den fungerar var som helst.

## Välj molntjänst

### Option 1: Railway (Rekommenderat - Enklast)
1. Gå till [railway.app](https://railway.app)
2. Logga in med GitHub
3. Klicka "New Project"
4. Välj "Deploy from GitHub repo"
5. Välj ditt repository
6. Railway kommer automatiskt detektera att det är Python och deploya

**Efter deployment:**
1. Railway ger dig en URL (t.ex. `https://din-app.up.railway.app`)
2. Gå till Settings → Domains för att se din URL
3. Uppdatera frontend med denna URL (se nedan)

### Option 2: Render
1. Gå till [render.com](https://render.com)
2. Logga in med GitHub
3. Klicka "New +" → "Web Service"
4. Välj ditt repository
5. Inställningar:
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Environment**: Python 3
6. Klicka "Create Web Service"

**Efter deployment:**
1. Render ger dig en URL (t.ex. `https://din-app.onrender.com`)
2. Uppdatera frontend med denna URL

## Uppdatera Frontend

Efter att backend är deployad, uppdatera frontend för att använda cloud-URL:

### Metod 1: Miljövariabel (Rekommenderat)

Skapa en fil `frontend/.env`:
```
VITE_API_URL=https://din-app.up.railway.app
```

Eller för Render:
```
VITE_API_URL=https://din-app.onrender.com
```

Starta sedan frontend igen.

### Metod 2: Direkt i koden

I `frontend/src/components/GeofenceEditor.jsx`, ändra rad 14:
```javascript
const API_BASE = 'https://din-app.up.railway.app/api'
```

## CORS Setup (Om nödvändigt)

Om du får CORS-fel, lägg till i `backend/main.py`:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # I produktion, sätt specifika domäner
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Testa

1. Öppna frontend på din dator (localhost:3000)
2. Öppna samma URL på telefonen (via datorns IP)
3. Starta spårning
4. Gå ut ur WiFi → telefonen växlar till mobilt internet
5. Backend ska fortfarande vara tillgänglig!

## Viktigt

- Backend körs nu i molnet, så du behöver inte ha datorn igång
- Alla GPS-positioner skickas direkt till molnet via mobilt internet
- Data sparas på servern (kommer tillbaka även om telefonen startas om)

