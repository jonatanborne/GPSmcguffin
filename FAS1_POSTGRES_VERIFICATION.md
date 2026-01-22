# FAS 1 - PostgreSQL Verifiering & Migration Plan

**Syfte:** Verifiera att PostgreSQL fungerar korrekt innan vi tar bort SQLite-stöd.

---

## 🎯 Steg-för-steg Plan

### Steg 1: Verifiera PostgreSQL-anslutning ✅

**Mål:** Bekräfta att backend kan ansluta till PostgreSQL korrekt.

**Vad vi gör:**
1. Kontrollera att `DATABASE_URL` eller `DATABASE_PUBLIC_URL` finns i `.env`
2. Testa att backend kan ansluta till PostgreSQL
3. Verifiera att tabeller skapas korrekt
4. Testa grundläggande CRUD-operationer

**Kontrolllista:**
- [ ] `.env` fil finns i `backend/` mappen
- [ ] `DATABASE_PUBLIC_URL` är satt (från Railway)
- [ ] Backend kan starta utan fel
- [ ] `/ping` endpoint fungerar
- [ ] Kan skapa/läsa tracks
- [ ] Kan skapa/läsa positions

**Vad vi gör om det inte fungerar:**
- Felsöka anslutningen
- Kontrollera Railway-inställningar
- Fixa eventuella problem
- **INTE ta bort SQLite förrän detta fungerar**

---

### Steg 2: Testa alla funktioner med PostgreSQL ✅

**Mål:** Bekräfta att alla features fungerar med PostgreSQL.

**Vad vi testar:**
- [ ] Skapa tracks (human/dog)
- [ ] Lägga till positions
- [ ] Korrigera positions (manuellt)
- [ ] ML-korrigering fungerar
- [ ] Jämförelse mellan tracks
- [ ] Geofences
- [ ] Hiding spots
- [ ] Export/import

**Vad vi gör om något inte fungerar:**
- Fixa problemen
- Testa igen
- **INTE ta bort SQLite förrän allt fungerar**

---

### Steg 3: Migrera befintlig data (om det finns i SQLite) 📦

**Mål:** Om du har data i `data.db`, migrera den till PostgreSQL.

**Vad vi gör:**
1. Kontrollera om `backend/data.db` finns
2. Om den finns: Använd `migrate_sqlite_to_postgres.py` för att migrera
3. Verifiera att all data migrerades korrekt
4. Testa att allt fungerar med migrerad data

**Kontrolllista:**
- [ ] Kontrollera om `data.db` finns
- [ ] Om ja: Kör migration-script
- [ ] Verifiera att all data finns i PostgreSQL
- [ ] Testa att allt fungerar

---

### Steg 4: Ta bort SQLite-stöd (EFTER att allt fungerar) 🗑️

**Mål:** Förenkla koden genom att ta bort SQLite-stöd.

**Vad vi gör:**
1. Ta bort SQLite-fallback från `get_db()`
2. Ta bort alla `if is_postgres` checks
3. Använd bara PostgreSQL-syntax
4. Kräv `DATABASE_URL` (kasta fel om den saknas)
5. Ta bort SQLite-relaterade imports
6. Uppdatera dokumentation

**Kontrolllista:**
- [ ] Alla funktioner testade och fungerar
- [ ] Backup av kod skapad (git commit)
- [ ] Ta bort SQLite-kod
- [ ] Testa att allt fortfarande fungerar
- [ ] Uppdatera dokumentation

---

## 🔍 Verifierings-script

**Fil:** `backend/scripts/verify_postgres.py`

**Funktion:**
- Testa PostgreSQL-anslutning
- Verifiera att tabeller finns
- Testa grundläggande queries
- Ge tydlig feedback om något är fel

**Användning:**
```bash
python backend/scripts/verify_postgres.py
```

---

## ❓ Frågor att besvara

1. **Har du `.env` fil med `DATABASE_PUBLIC_URL`?**
   - [ ] Ja
   - [ ] Nej (behöver skapa)
   - **Svar:** _________________

2. **Fungerar backend med PostgreSQL just nu?**
   - [ ] Ja, allt fungerar
   - [ ] Nej, det finns problem
   - [ ] Vet inte, behöver testa
   - **Svar:** _________________

3. **Finns det data i `data.db` som behöver migreras?**
   - [ ] Ja, det finns data
   - [ ] Nej, databasen är tom
   - [ ] Vet inte
   - **Svar:** _________________

---

## 📝 Nästa Steg

1. **Först:** Verifiera PostgreSQL-anslutning (Steg 1)
2. **Sedan:** Testa alla funktioner (Steg 2)
3. **Om det finns data:** Migrera från SQLite (Steg 3)
4. **Slutligen:** Ta bort SQLite-stöd (Steg 4)

---

**Viktigt:** Vi tar INTE bort SQLite förrän vi vet att PostgreSQL fungerar 100%!
