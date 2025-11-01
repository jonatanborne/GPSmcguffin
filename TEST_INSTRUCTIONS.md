# Testinstruktioner - Dogtracks Geofence Kit

## Snabbstart

### 1. Starta Backend
```bash
cd backend
pip install fastapi uvicorn pydantic
uvicorn main:app --reload
```
Backend körs på: `http://localhost:8000`

### 2. Starta Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend körs på: `http://localhost:3000`

## Testscenarier

### Scenario 1: Grundläggande geofence-test
1. Öppna `http://localhost:3000`
2. Klicka "Cirkel" och klicka på kartan
3. Se hur blå cirkel (50m radie) läggs till
4. Observera hur hundikonen 🐕 rör sig
5. Se statusändringar: "Inne i område" / "Ute ur område"
6. Kontrollera händelser i höger panel

### Scenario 2: Polygon-geofence
1. Klicka "Polygon"
2. Klicka 3+ punkter på kartan för att skapa form
3. Klicka "Slutför polygon"
4. Se grön polygon på kartan
5. Observera hur hunden interagerar med polygonen

### Scenario 3: Flera geofences
1. Skapa 2-3 cirklar och 1-2 polygoner
2. Placera dem nära varandra
3. Se hur hunden kan vara i flera områden samtidigt
4. Kontrollera att status visar alla områden: "I: Cirkel 1, Polygon 2"

### Scenario 4: API-test
1. Öppna `http://localhost:8000/docs`
2. Testa endpoints:
   - GET `/ping` - ska returnera `{"status": "ok"}`
   - GET `/geofences` - lista alla geofences
   - POST `/evaluate` - testa position:
     ```json
     {
       "position": {"lat": 59.334, "lng": 18.066}
     }
     ```

### Scenario 5: Flera agents (människa + hund) - **NYTT!**
Detta scenario låter dig testa med två enheter samtidigt (t.ex. två telefoner).

#### Förberedelse:
1. Se till att backend körs på din dator/development-server
2. Backend måste vara tillgänglig från båda enheterna (se nätverksinstruktioner nedan)

#### Test med två enheter:

**Enhet 1 - Människa:**
1. Öppna appen i webbläsaren på telefon/tablet 1
2. Gå till GPS-spårning-sektionen
3. Välj "Spåra som: Människa 🚶"
4. Klicka "▶ Starta spårning"
5. Bevilja GPS-tillstånd
6. Börja gå - ditt spår visas i rött på kartan

**Enhet 2 - Hund:**
1. Öppna appen i webbläsaren på telefon/tablet 2 (eller i inkognito-fönster)
2. Gå till GPS-spårning-sektionen
3. Välj "Spåra som: Hund 🐕"
4. Klicka "▶ Starta spårning"
5. Bevilja GPS-tillstånd
6. Börja röra dig - hundens spår visas i lila på kartan

**Observera:**
- Båda spåren syns på båda enheternas kartor (uppdateras automatiskt var 3:e sekund)
- Röd linje = människans spår
- Lila linje = hundens spår
- Startmarkörer (🚶 och 🐕) visar var varje spår började
- Aktiva spår markeras med "Aktiv"-badge i listan

#### Nätverksinstruktioner för flera enheter:

**Alternativ 1: Lokalt nätverk (rekommenderat)**
1. Hitta din dators lokala IP-adress:
   - Windows: Kör `ipconfig` i CMD, leta efter "IPv4 Address"
   - Mac/Linux: Kör `ifconfig` eller `ip addr`, leta efter inet-adressen
   - Exempel: `192.168.1.100`

2. Starta backend med:
   ```bash
   uvicorn main:app --host 0.0.0.0 --reload
   ```

3. Starta frontend med:
   - Ändra i `vite.config.js` eller använd:
   ```bash
   npm run dev -- --host
   ```

4. På telefonerna, öppna:
   - `http://[DIN_IP]:3000` (t.ex. `http://192.168.1.100:3000`)

5. Se till att telefonerna är på samma WiFi-nätverk som datorn

**Alternativ 2: ngrok (för extern access)**
```bash
# Installera ngrok
# Kör ngrok för backend
ngrok http 8000

# Kör ngrok för frontend (i annat terminal)
ngrok http 3000
```
Använd de ngrok-URL:er du får på telefonerna.

**Alternativ 3: Lokal testning (en enhet i taget)**
- Skapa ett spår som människa
- Stoppa spårningen
- Byta till "Hund"-läge
- Skapa nytt spår som hund
- Se båda spåren på kartan samtidigt

## Förväntade resultat

### ✅ Fungerar korrekt:
- Hunden rör sig smidigt på kartan
- Geofences visas med rätt färger (blå=cirkel, grön=polygon)
- Status uppdateras i realtid
- ENTER/EXIT-händelser loggas med timestamp
- API:er svarar korrekt
- Polygoner kan skapas med 3+ punkter

### 🐛 Kända begränsningar:
- Geofences sparas bara i minnet (försvinner vid omstart)
- Ingen databas ännu
- Ingen autentisering
- GPS-simulering är enkel (inte realistisk hundrörelse)

## Felsökning

### Backend startar inte:
- Kontrollera att Python är installerat
- Kör `pip install fastapi uvicorn pydantic`
- Kontrollera att port 8000 är ledig

### Frontend startar inte:
- Kontrollera att Node.js är installerat
- Kör `npm install` i frontend-mappen
- Kontrollera att port 3000 är ledig

### API-anrop misslyckas:
- Kontrollera att backend körs på port 8000
- Kontrollera proxy-inställningar i `vite.config.js`
- Öppna Developer Tools (F12) och kolla Console för fel

### Karta visas inte:
- Kontrollera internetanslutning (använder OpenStreetMap)
- Kontrollera att Leaflet CSS laddas i `index.html`

## Nästa steg för förbättring

1. **Databas**: Lägg till SQLite för permanent lagring
2. **Realistisk GPS**: Bättre simulering av hundrörelse
3. **Autentisering**: Lägg till användarhantering
4. **Förbättrad UI**: Bättre design och responsivitet
5. **Export/Import**: Spara och ladda geofence-konfigurationer
