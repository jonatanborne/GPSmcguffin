# Plan för fortsatt utveckling - Dogtracks Geofence Kit

## Projektstatus - Översikt

### ✅ Klart och fungerar
- **Backend**: FastAPI med PostgreSQL/SQLite support, komplett API för geofences, tracks, positions och annoteringar
- **Frontend - GeofenceEditor**: App-läge för spårning med människa/hund, geofences (cirkel/polygon), gömställen
- **Frontend - TestLab**: Annoteringsmiljö med:
  - Position-markering (korrekt/inkorrekt/pending)
  - Manuell korrigering av GPS-positioner (dra markörer eller klicka)
  - Batch-justeringsläge för effektiv massjustering
  - Snapping till närmaste position
  - Anteckningar per position
  - Navigering mellan positioner
- **Tile Converter**: Verktyg för att ladda ner och förstora kartbilder
- **Databas**: Migration från SQLite till PostgreSQL (Railway)

### 🔄 Pågående / Förbättringar
- TestLab har grundläggande lokal tile layer integration (men kan förbättras)
- Tile converter är fristående verktyg (kan integreras bättre i frontend)

---

## Prioriterad Utvecklingsplan

### Kort sikt (1-2 veckor)

#### 1. Förbättring av Tile-hantering ⚡ HÖG PRIORITET
**Syfte**: Gör det enklare att använda förstorade tiles i appen

**Uppgifter**:
- [ ] **Automatisk detektering av lokala tiles** i TestLab
  - Kontrollera om `/tiles/`-mappen finns och innehåller data
  - Uppdatera `localTilesAvailable` state baserat på faktisk tillgänglighet
  - Visa tydlig indikator om lokala tiles är tillgängliga eller inte
  
- [ ] **Förbättra tile converter integration**
  - Lägg till validering av tile-struktur vid start
  - Förbättrad felhantering när tiles saknas
  - Automatisk upptäckt av tile-storlek (512, 768, 1024) baserat på faktiska filer

- [ ] **UI-förbättringar för tile-lager**
  - Tydlig markering när "Lokal Högupplösning"-lager är aktivt
  - Lägg till information om tile-upplösning och område i settings
  - Varning om tile-området inte täcker nuvarande visning

**Förväntat resultat**: Användare kan enkelt se och använda förstorade tiles utan manuell konfiguration

---

#### 2. Förbättring av Annoteringsflöde ⚡ HÖG PRIORITET
**Syfte**: Gör TestLab ännu mer effektivt för att samla in annoteringsdata

**Uppgifter**:
- [ ] **Förbättrad visuell feedback**
  - Visa tydligare skillnad mellan original och korrigerad position
  - Lägg till linje som visar korrigeringsavståndet (med etikett i meter)
  - Färgkodning baserat på korrigeringsavstånd (grön = liten, röd = stor)

- [ ] **Statistik och översikt**
  - Dashboard med antal annoterade positioner per status
  - Visa genomsnittligt korrigeringsavstånd
  - Förloppsindikator: "X av Y positioner annoterade"
  - Export-funktion för annoterade data (JSON/CSV)

- [ ] **Förbättrad navigering**
  - Snabbare navigering med piltangenter (← →)
  - "Hoppa till nästa ej märkt"-knapp
  - Filter: Visa endast pending/incorrect/correct positioner

**Förväntat resultat**: Användare kan annotera data snabbare och mer effektivt

---

#### 3. Datakvalitet och Validering ⚡ MEDEL PRIORITET
**Syfte**: Säkerställ att samlad data är av hög kvalitet

**Uppgifter**:
- [ ] **Automatisk validering**
  - Varning om position ligger långt utanför track-banan
  - Detektera potentiella fel: för snabba rörelser, plötsliga hopp
  - Jämför hundspår mot människaspår för avvikelsedetektering

- [ ] **Kvalitetsmätningar**
  - Beräkna avvikelse mellan hund- och människaspår
  - Visa avståndsstatistik per track
  - Identifiera problemområden (där avvikelser är störst)

- [ ] **Data-export för ML-träning**
  - Strukturerad export med original + korrigerad position
  - Inkludera metadata (tid, noggrannhet, korrigeringsavstånd)
  - Format som passar för ML-träning (t.ex. JSONL)

**Förväntat resultat**: Bättre datakvalitet och enklare förberedelse för ML-träning

---

### Medellång sikt (2-4 veckor)

#### 4. ML-Modell Integration 🎯 MEDEL PRIORITET
**Syfte**: Börja använda annoterad data för att förbättra GPS-positionsberäkningar

**Uppgifter**:
- [ ] **Dataanalys och förberedelse**
  - Analysera annoterad data för mönster
  - Identifiera vanliga typer av GPS-fel (offset, drift, nois)
  - Förbered träningsdata i lämpligt format

- [ ] **Enkel korrigeringsmodell**
  - Implementera grundläggande ML-modell (t.ex. linjär regression eller beslutsträd)
  - Träna på annoterad data för att förutsäga korrigeringar
  - Integration i backend för automatisk position-korrektion

- [ ] **Validering och testning**
  - Testa modellens prestanda på testdata
  - Jämför automatiska korrigeringar mot manuella
  - Förbättra modell iterativt

**Förväntat resultat**: Automatisk GPS-korrektion baserat på tränad modell

---

#### 5. Förbättrad Visualisering 🎨 LÅG-MEDEL PRIORITET
**Syfte**: Bättre visuell representation av spår och avvikelser

**Uppgifter**:
- [ ] **Heatmap-visualisering**
  - Visa områden med högsta GPS-osäkerhet
  - Heatmap över korrigeringsavstånd
  - Identifiera problemområden visuellt

- [ ] **Förbättrad track-visualisering**
  - Visa både original och korrigerad track samtidigt
  - Animation av hundens rörelse över tiden
  - 3D-visualisering av elevation (om data finns)

- [ ] **Interaktiva analysverktyg**
  - Zooma in på specifika avvikelser
  - Jämförelse mellan olika tracks
  - Export av visualiseringar (screenshots, video)

**Förväntat resultat**: Mer insiktsfull visualisering av data

---

#### 6. Prestanda och Skalbarhet ⚙️ MEDEL PRIORITET
**Syfte**: Säkerställ att systemet hanterar stora datamängder

**Uppgifter**:
- [ ] **Optimering av kartvisning**
  - Lazy loading av positions för stora tracks
  - Clustering av markörer vid låg zoom
  - Debouncing av kartuppdateringar

- [ ] **Databasoptimering**
  - Indexering för snabbare queries
  - Paginering av positions-listor
  - Caching av ofta använda queries

- [ ] **Frontend-prestanda**
  - Memoization av beräkningar
  - Virtualisering av långa listor
  - Optimering av re-renders

**Förväntat resultat**: Systemet hanterar hundratals tracks med tusentals positioner smidigt

---

### Lång sikt (1-3 månader)

#### 7. Avancerade Funktioner 🚀 LÅG PRIORITET
**Uppgifter**:
- [ ] **Flera samtidiga användare**
  - Realtids-synkronisering mellan användare
  - Konflikthantering för samtidiga redigeringar
  - Användarhantering och behörigheter

- [ ] **Mobilapp**
  - React Native eller PWA
  - GPS-spårning direkt från mobilen
  - Offline-stöd

- [ ] **API för extern integration**
  - REST API för externa system
  - Webhooks för händelser
  - OAuth-autentisering

---

## Tekniska Förbättringar

### Backend
- [ ] Lägg till API-endpoint för tile-status
- [ ] Förbättrad felhantering och logging
- [ ] API-dokumentation med exempel
- [ ] Automatiska backups av databas

### Frontend
- [ ] Förbättrad responsiv design för mobil
- [ ] Tillgänglighetsförbättringar (a11y)
- [ ] Dark mode support
- [ ] Internationellisering (i18n) för engelska/svenska

### DevOps
- [ ] CI/CD pipeline
- [ ] Automatiserade tester
- [ ] Docker Compose för lokal utveckling
- [ ] Monitoring och alerting

---

## Nästa Steg - Rekommendation

**För att börja direkt, rekommenderas**:

1. **Starta med Tile-hantering** (punkt 1)
   - Relativt enkelt att implementera
   - Ger omedelbar nytta för användare
   - Förbättrar användarupplevelsen avsevärt

2. **Fortsätt med Annoteringsflöde-förbättringar** (punkt 2)
   - Bygger på befintlig funktionalitet
   - Ökar effektiviteten för att samla in data
   - Nödvändig för att bygga bättre dataset

3. **Börja planera ML-integration** (punkt 4)
   - När tillräckligt med annoterad data finns
   - Börja med enkel modell för proof-of-concept

---

## Öppna Frågor för Diskussion

1. **Vilken typ av ML-modell ska vi använda?**
   - Linjär regression?
   - Neural nätverk?
   - Gradient boosting (XGBoost, LightGBM)?

2. **Hur mycket annoterad data behövs?**
   - Minsta antal positioner för träning?
   - Hur ska vi säkerställa datakvalitet?

3. **Ska vi ha offline-stöd från start?**
   - Redan delvis implementerat i GeofenceEditor
   - Utöka till TestLab?

4. **Hur ska vi hantera flera användare?**
   - Behöver vi användarhantering nu?
   - Eller fokusera på single-user först?

---

## Resurser och Dokumentation

### Befintlig dokumentation
- `docs/CONTEXT.md` - Projektkontext och status
- `docs/API.md` - API-dokumentation
- `docs/HOW_IT_WORKS.md` - Teknisk översikt
- `tools/README_TILE_CONVERTER.md` - Tile converter guide
- `TEST_INSTRUCTIONS.md` - Testinstruktioner

### Viktiga filer
- `backend/main.py` - Backend API
- `frontend/src/components/TestLab.jsx` - TestLab-komponent
- `frontend/src/components/GeofenceEditor.jsx` - App-läge
- `tools/tile_converter.py` - Tile converter verktyg

---

## Uppdatering av denna plan

Denna plan bör uppdateras regelbundet när:
- Nya funktioner implementeras
- Prioriteringar ändras
- Nya krav uppstår
- Tekniska beslut fattas

**Senast uppdaterad**: 2024-12-19

