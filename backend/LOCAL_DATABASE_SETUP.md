# Anslut till Railway's Postgres lokalt

För att se dina spår från Railway lokalt, behöver du ansluta till Railway's Postgres-databas.

## Steg 1: Hämta DATABASE_PUBLIC_URL från Railway

1. Öppna [Railway Dashboard](https://railway.app)
2. Gå till ditt projekt
3. Klicka på **Postgres-tjänsten** (inte backend-tjänsten)
4. Gå till fliken **"Variables"** eller **"Connect"**
5. Hitta **`DATABASE_PUBLIC_URL`** (inte `DATABASE_URL` - den fungerar bara på Railway)
6. **Kopiera** connection stringen (ser ut som: `postgresql://postgres:password@hostname.railway.app:5432/railway`)

## Steg 2: Skapa .env-fil i backend-mappen

Skapa en fil som heter `.env` i `backend/` mappen med innehållet:

```bash
DATABASE_PUBLIC_URL=postgresql://postgres:password@hostname.railway.app:5432/railway
```

**VIKTIGT:** Ersätt med din faktiska connection string från Railway!

## Steg 3: Starta om backend

1. Stoppa backend (Ctrl+C)
2. Starta om: `cd backend && python run.py`
3. Nu ska du se dina spår från Railway! 🎉

## Alternativ: Använd SQLite lokalt (tom databas)

Om du INTE vill ansluta till Railway's Postgres, ta bort eller kommentera ut raden i `.env`:

```bash
# DATABASE_PUBLIC_URL=...
```

Då använder backend SQLite (`data.db`) lokalt istället.

## Felsökning

### "Connection refused" eller timeout
- Kontrollera att `DATABASE_PUBLIC_URL` är korrekt (inte `DATABASE_URL`)
- Kontrollera att Railway's Postgres-tjänst är igång
- Vissa nätverk kan blockera externa databasanslutningar

### "No module named 'psycopg2'"
- Installera: `pip install psycopg2-binary`
- Eller: `pip install -r requirements.txt`

### "No module named 'dotenv'"
- Installera: `pip install python-dotenv`
- Eller: `pip install -r requirements.txt` (python-dotenv är nu med i requirements.txt)

