# Fix för Railway Frontend Deployment

## Problemet
Railway försöker köra `cd frontend && npm install...` men du är redan i frontend-mappen när Root Directory är satt till `frontend`.

## Lösning

### I Railway Settings:

1. Gå till din frontend-service
2. Settings → **Deploy**
3. Under **"Build Command"**, ändra från:
   ```
   cd frontend && npm install && npm run build
   ```
   Till:
   ```
   npm install && npm run build
   ```

4. Under **"Start Command"**, ändra från:
   ```
   cd frontend && npm run preview
   ```
   Till:
   ```
   npm run preview
   ```

**Varför?**
När Root Directory är `frontend` så startar Railway redan i den mappen. Du behöver inte `cd frontend` igen!

### Alternativt: Ta bort Root Directory

Om ovan inte fungerar:
1. Settings → **Root Directory**: Lämna TOM (eller ta bort `frontend`)
2. **Build Command**: `cd frontend && npm install && npm run build`
3. **Start Command**: `cd frontend && npm run preview`

## Efter ändring
Railway bör automatiskt deploya igen. Du ska se:
- ✅ `npm install` körs
- ✅ `npm run build` körs
- ✅ `npm run preview` startar frontend

