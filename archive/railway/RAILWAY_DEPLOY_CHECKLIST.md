# Railway deploy – kontrollera att ny modell används

Om ML Dashboard fortfarande visar gamla siffror (0.075 m) efter redeploy:

## 1. Kolla vad backend faktiskt returnerar

Öppna i webbläsaren:
```
https://<din-railway-url>/ml/model-info
```

- Visar den `"test_mae": 0.075...` → backend har fortfarande gammal modell
- Visar den `"test_mae": 0.055...` → backend är uppdaterad (då är felet i frontend/cache)

## 2. Kontrollera hur Railway deployar

**Alternativ A: Deploy från GHCR (rekommenderat)**  
- Settings → Source: Docker Image  
- Image: `ghcr.io/jonatanborne/gpsmcguffin:latest`  
- Redeploy hämtar senaste image från GitHub Actions

**Alternativ B: Build från GitHub**  
- Settings → Source: GitHub repo  
- Då bygger Railway själv och kan ha cache-problem  
- Prova: **Settings → Redeploy → "Clear build cache"** (eller liknande)

## 3. Tvinga ny build (om du bygger från GitHub)

- Gör en liten ändring och push (t.ex. denna fil)
- Eller i Railway: Redeploy med "Clear cache" / "Rebuild from scratch"

## 4. Verifiera image

Om du använder GHCR: kolla att senaste Actions-build i GitHub lyckades **efter** din model-push.
