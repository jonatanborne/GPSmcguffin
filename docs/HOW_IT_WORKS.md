# Hur systemet fungerar - Teknisk översikt

## Kort svar: JA, datorn måste vara igång

Just nu måste din dator köra både backend och frontend för att systemet ska fungera.

---

## Vad händer tekniskt?

### 1. Backend (FastAPI-servern)
- **Körs på**: Din dator (localhost:8000)
- **Vad den gör**:
  - Lagrar alla geofences i minnet
  - Lagrar alla tracks (spår) i minnet
  - Tar emot GPS-positioner från telefonerna
  - Räknar ut om positioner är inne/ute i geofences
- **Vad händer om datorn stängs av?**
  - All data försvinner (sparas bara i minnet)
  - Telefonerna kan inte spara/spåra längre

### 2. Frontend (React-appen)
- **Körs på**: Din dator (localhost:3000)
- **Vad den gör**:
  - Visar kartan och UI
  - Skickar GPS-data till backend
  - Visar alla spår på kartan
- **Hur telefonerna ansluter**:
  - Telefonerna öppnar `http://[DIN_DATORS_IP]:3000`
  - Detta visar samma frontend som körs på datorn
  - Frontend skickar sedan allt till backend via `/api`

### 3. Telefonerna
- **Vad de gör**:
  - Använder sin GPS för att få position
  - Skickar positioner till backend (via frontend)
  - Visar kartan och spåren i webbläsaren
- **Vad de BEHÖVER**:
  - Anslutning till samma WiFi som datorn
  - Tillgång till backend (som körs på datorn)

---

## Flödet steg för steg

```
[Telefon 1]                    [Din Dator]                    [Telefon 2]
     │                              │                              │
     │  1. Öppnar frontend          │                              │
     │──────────────────────────────>│                              │
     │  2. Hämtar kartan             │                              │
     │<──────────────────────────────│                              │
     │                              │                              │
     │  3. Startar GPS-spårning     │                              │
     │  4. Skickar position         │                              │
     │──────────────────────────────>│                              │
     │                              │  5. Sparar i backend         │
     │                              │  (i minnet)                   │
     │                              │                              │
     │                              │  6. Frontend frågar backend  │
     │<──────────────────────────────│                              │
     │  7. Visar spåret på karta   │                              │
     │                              │                              │
     │                              │                              │
     │                              │                              │  8. Öppnar samma frontend
     │                              │<───────────────────────────────│
     │                              │                              │  9. Ser spår från båda
     │                              │───────────────────────────────>│
     │                              │                              │
```

---

## Alternativ för att INTE behöva datorn

### Alternativ 1: Deploya till en server/cloud
**Fördelar:**
- Datorn kan vara avstängd
- Fungerar från var som helst (inte bara lokalt nätverk)

**Hur:**
1. Deploya backend till t.ex.:
   - Heroku
   - Railway
   - DigitalOcean
   - AWS/Azure
   - Din egen server

2. Deploya frontend till t.ex.:
   - Netlify
   - Vercel
   - GitHub Pages
   - Samma server som backend

3. Uppdatera `API_BASE` i frontend till server-URL

**Nackdelar:**
- Kräver hosting (kostar pengar eller setup-tid)
- Mer komplex setup

### Alternativ 2: Använd ngrok (tillfälligt)
**Fördelar:**
- Snabb setup
- Fungerar från var som helst

**Hur:**
```bash
# På datorn - exponera backend
ngrok http 8000

# På datorn - exponera frontend
ngrok http 3000
```
Använd ngrok-URL:erna på telefonerna.

**Nackdelar:**
- ngrok URL:er ändras varje gång (gratis-plan)
- Begränsad hastighet
- Inte permanent lösning

### Alternativ 3: Bygg frontend som standalone app
**Fördelar:**
- Kan spara lokalt på telefonen
- Fungerar offline (men ingen delning av spår)

**Hur:**
- Bygg frontend med `npm run build`
- Hosta statiska filer på CDN
- Men backend måste fortfarande köras någonstans

**Nackdelar:**
- Ingen delning mellan enheter
- Backend behövs fortfarande

---

## Rekommendation för dig

**Just nu (för testning):**
- ✅ Ja, datorn måste vara igång
- ✅ Både backend och frontend måste köra
- ✅ Båda telefonerna måste vara på samma WiFi

**Senare (produktion):**
- Deploya till en server/cloud
- Då kan datorn vara avstängd

---

## Vad körs var?

```
┌─────────────────────────────────────────┐
│  Din Dator                               │
│  ┌──────────────┐  ┌──────────────┐    │
│  │ Backend      │  │ Frontend      │    │
│  │ :8000        │  │ :3000        │    │
│  │              │  │              │    │
│  │ Lagrar data  │  │ Visar UI     │    │
│  │ (i minnet)   │  │ Skickar API  │    │
│  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────┘
         ▲                    ▲
         │                    │
         │                    │
    ┌────┴────┐          ┌────┴────┐
    │         │          │         │
  Telefon 1          Telefon 2
  (GPS-spårning)     (GPS-spårning)
```

**Viktigt**: All data lagras på datorn (i backend). Telefonerna är bara "klienter" som skickar data till datorn.

---

## Sammanfattning

**Måste datorn vara igång?**
- **JA** - Backend måste köra för att spara data
- **JA** - Frontend måste köra för att telefonerna ska kunna nå UI:et
- **ALTERNATIV** - Deploya till server för att slippa ha datorn igång

**Vad händer om datorn stängs av?**
- Telefonerna kan inte längre spåra
- All data försvinner (sparas inte permanent ännu)
- Kartan fungerar inte

**Kan telefonerna fungera själva?**
- Nej, de behöver backend för att spara spår
- De kan visa GPS-position lokalt, men inte spara/spåra


