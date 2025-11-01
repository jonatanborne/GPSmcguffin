# Persistent Storage med SQLite

## Översikt

Applikationen använder nu **SQLite** för persistent lagring istället för in-memory storage. Detta betyder att alla data sparas i en databasfil (`data.db`) och behålls även när servern startar om eller när du pausar tjänsten i Railway.

## Vad sparas?

Alla data sparas i databasen:
- ✅ **Geofences** (cirklar och polygoner)
- ✅ **Tracks** (människaspår och hundspår)
- ✅ **Track positions** (alla GPS-positioner)
- ✅ **Hiding spots** (gömställen och deras status)

## Hur det fungerar

### Lokalt (Development)
- Databasfilen skapas automatiskt som `data.db` i backend-mappen
- Data sparas varje gång du skapar/uppdaterar något

### På Railway (Production)
- Railway behåller filsystemet mellan omstarter
- Databasfilen sparas i Railway's persistent storage
- **Viktigt**: Om du tar bort och skapar tjänsten igen, försvinner datan (men inte om du bara pausar/startar)

## Backup (rekommenderat för viktig data)

För att vara säker kan du:
1. **Ladda ner databasfilen** från Railway (via Railway CLI eller SSH)
2. **Exportera data via API** (alla endpoints finns tillgängliga)
3. **Använd Railway's Volume** för mer permanent lagring (kräver Railway Pro)

## Tekniska detaljer

- **Databas:** SQLite (inbyggt i Python, behöver inte installeras)
- **Fil:** `data.db` (eller värdet av `DB_PATH` environment variable)
- **Tabeller:**
  - `geofences` - Geofences (cirklar och polygoner)
  - `tracks` - Spår (människor och hundar)
  - `track_positions` - GPS-positioner för varje spår
  - `hiding_spots` - Gömställen kopplade till tracks

## Felsökning

Om du märker att data försvinner:
1. Kontrollera att `data.db`-filen finns i Railway
2. Kontrollera Railway logs för eventuella databasfel
3. Se till att du inte har tagit bort och återskapat tjänsten (vilket skapar ett nytt filsystem)

