# Dogtracks Geofence Kit - Master Plan

**Senast uppdaterad**: 2024-11-25  
**Status**: Living document - uppdateras kontinuerligt

---

## 🎯 Varför detta projekt finns

### Bakgrund

Detta är ett **companion-projekt** för **Dogtracks** ([dogtracks.se](https://dogtracks.se)), ett kommersiellt företag inom hundspårningssport där:

- Användare lägger ut spår (tracks) av olika former och storlekar
- Efter att spåret är lagt återvänder användaren till startpunkten
- Hunden skickas ut för att följa spåret med en telefon eller GPS-halsband

**Användningsområden:**

- 🏆 **Tävling** - Officiella tävlingar där resultat och poäng är avgörande
- 🎯 **Träning** - Träningspass för att förbättra hundens prestanda
- 📊 **Analys** - Feedback till hundägare om prestanda och utveckling

**Projektets natur:**

- ✅ Kommersiellt projekt för Dogtracks
- ✅ Inga hårda deadlines - fokus på kvalitet och fungerande lösning
- ✅ Potentiell roll/anställning om problemet löses framgångsrikt
- ✅ Demonstration av teknisk kompetens och problemlösningsförmåga

### Problemet vi löser

**GPS är opålitligt** - även när hunden följer det exakta spåret perfekt:

- GPS-avläsningar fluktuerar konstant (5-50 meter fel)
- Det inspelade hundspåret ser därför förvrånget ut trots att hunden gick rätt
- Vi kan inte avgöra när hunden faktiskt är på spåret vs. när den avviker
- Detta gör det omöjligt att ge korrekt feedback till hundägaren

**Varför detta är kritiskt:**

- ⚠️ **Tävlingsresultat** - Poäng och placeringar baseras på GPS-data
- ⚠️ **Rättvisa** - Fel GPS kan ge orättvisa resultat (hund får fel poäng)
- ⚠️ **Träningsdata** - Felaktig data leder till felaktig analys och försämrad träning
- ⚠️ **Användarförtroende** - Om systemet inte är pålitligt kommer användare inte lita på det

**Kravet:** Noggrannheten måste vara så hög som tekniskt möjligt, särskilt för tävlingssammanhang där resultat är avgörande.

### Vår lösning

Vi bygger en **fristående hjälpmodul/algoritm** som kan:

1. **Jämföra** hundens live GPS-punkter mot referensspåret
2. **Upptäcka** när hunden är på spåret vs. när den avviker (med maximal noggrannhet)
3. **Korrigera** GPS-fel automatiskt med hjälp av ML

### Varför fristående projekt?

- Vi har **inte direkt tillgång** till production-appens kod
- Vi kör därför egna experiment och tester
- Lösningen ska vara **lätt att integrera** senare med den riktiga appen
- Vi använder **TestLab** för att samla träningsdata för ML-modellen

### Långsiktigt mål

Skapa en **ML-modell** som kan:

- Automatiskt korrigera GPS-positioner baserat på kontext
- Lära sig typiska GPS-fel för olika miljöer (skog, stad, öppet fält)
- Ge hundägare korrekt feedback om hundens prestanda
- Integreras i produktions-appen för att förbättra användarupplevelsen

---

## 📊 Nuläge - Vad vi har åstadkommit

### ✅ Backend (FastAPI)

- **Databas**: SQLite med stöd för PostgreSQL (Railway)
- **API-endpoints**: 15+ endpoints för geofences, tracks, positions, hiding spots
- **GPS-beräkningar**: Haversine-formel, point-in-polygon algoritm
- **Funktioner**: Spårning, jämförelse, gömställen, geofences

**Nyckelendpoints:**

- Geofences: Skapa cirkel/polygon, evaluera positioner
- Tracks: Skapa, lista, jämföra spår
- Positions: Lägg till GPS-positioner med accuracy
- Hiding spots: Hantera gömställen med hittad/ej hittad status
- Annotations: Märka och korrigera GPS-positioner

### ✅ Frontend (React + Vite + Leaflet)

**GeofenceEditor (App-läge):**

- Interaktiv karta med GPS-spårning
- Geofence-hantering (cirkel/polygon)
- Spårning (människa/hund) med real-time uppdatering
- Gömställen-hantering
- Offline-queue för positioner
- Spårjämförelse med statistik

**TestLab (Annoteringsmiljö):**

- Position-markering (korrekt/inkorrekt/pending)
- Manuell korrigering av GPS-positioner
- Batch-justeringsläge för effektiv massjustering
- Snapping till närmaste position
- Anteckningar per position
- Navigering mellan positioner
- Lokal tile layer integration (högupplösta kartor)

### ✅ Verktyg

- **Tile Converter**: Ladda ner och förstora kartbilder för offline-användning

### ✅ Deployment

- Backend och frontend deployade på Railway
- HTTPS för GPS-tillgång
- Persistent storage
- CORS-konfiguration

---

## 🎯 Kort sikt (1-2 veckor)

### Prioritet 1: GPS-förbättring ⚡ HÖG

#### Vecka 1 - Del 1: GPS-smoothing & Filtering

**Mål**: Förbättra GPS-noggrannheten genom att filtrera bort noise och outliers

**Uppgifter:**

**Backend:**

- [ ] Skapa `backend/utils/gps_filter.py`
  - `smooth_track_positions()` - Moving average för att minska noise
  - `filter_speed_outliers()` - Ta bort omöjliga hastigheter (>50 km/h för människa, >100 km/h för hund)
  - `filter_accuracy_outliers()` - Filtrera positioner med dålig accuracy (>50m)
- [ ] Lägg till API-endpoint: `POST /tracks/{track_id}/smooth`

  - Applicera smoothing på ett spår
  - Returnera smoothat spår

- [ ] Uppdatera compare-funktioner att använda smoothing
  - Lägg till "raw_distance" och "smoothed_distance"
  - Använd accuracy-data för viktad beräkning

**Frontend:**

- [ ] Visa GPS-accuracy i realtid när man spårar
- [ ] Färgkodning: grön = bra accuracy (<10m), gul (10-20m), röd = dålig (>20m)
- [ ] Varning vid låg accuracy

**Leverabler:**

- Renare spår med mindre GPS-noise
- Bättre jämförelseresultat
- Visuell feedback om GPS-kvalitet

**Tidsåtgång**: 1-2 dagar

---

#### Vecka 1 - Del 2: Intelligent spårjämförelse

**Mål**: Implementera segment-baserad matchning som fungerar trots GPS-fel och olika timing

**Uppgifter:**

**Backend:**

- [ ] Skapa `backend/utils/track_comparison.py`

  - `split_track_into_segments()` - Dela upp spår baserat på riktningsförändringar
  - `compare_segments()` - Jämför två segment och returnera similarity score
  - `match_tracks_by_segments()` - Matcha spår segment för segment
  - `calculate_confidence_score()` - Beräkna confidence score (0-100) baserat på:
    - Avstånd mellan spår
    - Segment similarity
    - Gömställen matchning
    - GPS accuracy

- [ ] Lägg till API-endpoint: `GET /tracks/{track_id}/compare-improved`
  - Segment-baserad matchning
  - Returnera segment_matches, overall_similarity, confidence_score

**Frontend:**

- [ ] Visa båda spåren med färgkodning baserat på avstånd:
  - Grön: < 10m
  - Gul: 10-30m
  - Orange: 30-50m
  - Röd: > 50m
- [ ] Markera matchade segment
- [ ] Visa confidence score visuellt (progress bar)

**Leverabler:**

- Bättre matchning mellan spår trots GPS-fel
- Visuell representation av hur bra matchningen är
- Confidence score för bedömning av spårningens kvalitet

**Tidsåtgång**: 2-3 dagar

---

### Prioritet 2: TestLab-förbättringar ⚡ HÖG

**Mål**: Gör annoteringsmiljön mer effektiv och användarvänlig

**Uppgifter:**

**Förbättrad visuell feedback:**

- [ ] Visa linje mellan original och korrigerad position
- [ ] Etikett med korrigeringsavstånd i meter
- [ ] Färgkodning baserat på korrigeringsavstånd (grön = liten, röd = stor)

**Statistik och översikt:**

- [ ] Dashboard med antal annoterade positioner per status
- [ ] Visa genomsnittligt korrigeringsavstånd
- [ ] Förloppsindikator: "X av Y positioner annoterade"
- [ ] Export-funktion för annoterade data (JSON/CSV)

**Förbättrad navigering:**

- [ ] Piltangenter för navigering (← →)
- [ ] "Hoppa till nästa ej märkt"-knapp
- [ ] Filter: Visa endast pending/incorrect/correct positioner

**Leverabler:**

- Snabbare annoteringsprocess
- Bättre översikt över arbetsflöde
- Enklare export av data för ML-träning

**Tidsåtgång**: 2-3 dagar

---

### Prioritet 3: Förbättrad visualisering 🎨 MEDEL

**Mål**: Bättre användarupplevelse med förbättrad visuell feedback

**Uppgifter:**

**Jämförelse-vy:**

- [ ] Dedikerad jämförelse-modal/vy
- [ ] Toggle för att växla mellan "raw" och "smoothed" spår
- [ ] Zoom till områden där spåren är nära varandra
- [ ] Förbättrad layout för statistik

**Real-time indicators:**

- [ ] GPS-accuracy indikator under spårning
- [ ] Historik över accuracy under spårningen
- [ ] Online/offline status tydligare markerad

**Före/efter-visning:**

- [ ] Visa både raw och smoothed spår samtidigt
- [ ] Visa förbättring i match_percentage

**Leverabler:**

- Bättre användarupplevelse
- Tydligare feedback under spårning
- Lättare att förstå spårjämförelse

**Tidsåtgång**: 2-3 dagar

---

### Prioritet 4: Tile-hantering ⚡ MEDEL

**Mål**: Gör det enklare att använda förstorade kartor

**Uppgifter:**

- [ ] Automatisk detektering av lokala tiles i TestLab
- [ ] Validering av tile-struktur vid start
- [ ] Tydlig indikator om lokala tiles är tillgängliga
- [ ] UI-förbättringar: visa tile-upplösning och täckning
- [ ] Varning om tile-området inte täcker nuvarande visning

**Leverabler:**

- Enklare att använda högupplösta kartor
- Tydlig feedback om tile-status

**Tidsåtgång**: 1-2 dagar

---

## 🚀 Medellång sikt (2-4 veckor)

### Avancerade algoritmer för spårjämförelse

#### Dynamic Time Warping (DTW)

**Syfte**: Jämför spår med olika hastighet/timing

**Implementation:**

- [ ] Implementera DTW-algoritm i Python
- [ ] API-endpoint: `GET /tracks/{track_id}/compare-dtw`
  - Returnera: dtw_distance, path (vilka positioner matchar), similarity_score

**Fördelar:**

- Hund kan gå samma rutt men långsammare/snabbare
- Mer robust mot timing-fel
- Bättre matchning för verkliga scenarios

**Tidsåtgång**: 3-4 dagar

---

#### Fréchet Distance

**Syfte**: Mät path similarity (hur lika är banorna?)

**Implementation:**

- [ ] Implementera Fréchet distance algoritm
- [ ] API-endpoint: `GET /tracks/{track_id}/compare-frechet`
  - Returnera: frechet_distance, path_similarity (0-1)

**Fördelar:**

- Mäter hela banan, inte bara punkter
- Mer robust mot GPS-fel
- Bättre för att avgöra om banor är lika

**Tidsåtgång**: 2-3 dagar

---

### ML-modell integration 🤖

**Syfte**: Använda annoterad data för att automatiskt förbättra GPS-positioner

**Fas 1: Dataanalys (1 vecka)**

- [ ] Analysera annoterad data för mönster
- [ ] Identifiera vanliga GPS-fel (offset, drift, noise)
- [ ] Förbered träningsdata i lämpligt format
- [ ] Beräkna features (accuracy, hastighet, omgivning, etc.)

**Fas 2: Enkel modell (1 vecka)**

- [ ] Implementera grundläggande ML-modell
  - Alternativ: Linjär regression, Random Forest, XGBoost
- [ ] Träna på annoterad data
- [ ] API-endpoint: `POST /tracks/{track_id}/auto-correct`
- [ ] Integration i backend för automatisk korrektion

**Fas 3: Validering och förbättring (1 vecka)**

- [ ] Testa modellens prestanda på testdata
- [ ] Jämför automatiska korrigeringar mot manuella
- [ ] Förbättra modell iterativt
- [ ] A/B-testning i TestLab

**Leverabler:**

- Automatisk GPS-korrektion
- Minskat behov av manuell annotering
- Bättre GPS-noggrannhet generellt

**Tidsåtgång**: 2-3 veckor

---

### Heatmaps & Dashboard 📊

**Heatmaps:**

- [ ] Beräkna density av positioner
- [ ] Leaflet heatmap-plugin integration
- [ ] Visa områden där hund spenderar mest tid
- [ ] Jämför människas och hundens heatmaps
- [ ] Färgkodning: röd = hög density, blå = låg

**Statistik-dashboard:**

- [ ] Lista alla träningspass
- [ ] Genomsnittlig match_percentage över tid
- [ ] Trendanalys (förbättras hunden?)
- [ ] Gömställen-statistik över tid
- [ ] Export till CSV/JSON
- [ ] Grafer och visualiseringar

**Leverabler:**

- Översiktlig analys av träningsdata
- Identifiera problemområden
- Spåra progression över tid

**Tidsåtgång**: 1 vecka

---

### Datakvalitet och validering ✅

**Automatisk validering:**

- [ ] Varning om position ligger långt utanför track
- [ ] Detektera potentiella fel: för snabba rörelser, plötsliga hopp
- [ ] Jämför hundspår mot människaspår för avvikelsedetektering

**Kvalitetsmätningar:**

- [ ] Beräkna avvikelse mellan hund- och människaspår
- [ ] Visa avståndsstatistik per track
- [ ] Identifiera problemområden

**Data-export för ML:**

- [ ] Strukturerad export med original + korrigerad position
- [ ] Inkludera metadata (tid, accuracy, korrigeringsavstånd)
- [ ] Format: JSONL eller CSV för ML-träning

**Leverabler:**

- Bättre datakvalitet
- Automatisk detektion av problem
- Förbered data för ML-träning

**Tidsåtgång**: 1 vecka

---

## 🌟 Lång sikt (1-3 månader)

### Multi-user support 👥

**Implementation:**

- [ ] Användarautentisering (API keys eller JWT tokens)
- [ ] User table i databas
- [ ] Authentication middleware
- [ ] Authorization checks
- [ ] Frontend: Login/register, user profile
- [ ] Dela spår mellan användare
- [ ] Roller (admin, user, viewer)

**Tidsåtgång**: 2 veckor

---

### Export/Import funktionalitet 📦

**Funktioner:**

- [ ] Export spår till JSON/GPX/KML
- [ ] Import spår från filer
- [ ] Dela spår via länk
- [ ] Backup/restore av data

**API-endpoints:**

```python
@app.get("/tracks/{id}/export")
def export_track(track_id: int, format: str = "json")

@app.post("/tracks/import")
def import_track(file: UploadFile)
```

**Tidsåtgång**: 1 vecka

---

### Historik & trendanalys 📈

**Funktioner:**

- [ ] Lista alla träningspass för en hund
- [ ] Jämför flera pass (trendanalys)
- [ ] Visa förbättring över tid
- [ ] Statistik per vecka/månad
- [ ] Linjediagram: match_percentage över tid
- [ ] Jämför flera pass på karta
- [ ] Highlight bästa/sämsta pass

**Tidsåtgång**: 1 vecka

---

### Notifikationer 🔔

**Funktioner:**

- [ ] Notifikation när hund hittar gömställe
- [ ] Notifikation när hund går utanför geofence
- [ ] WebSocket för real-time updates (eller long polling)
- [ ] Push-notifikationer (Web Push API)
- [ ] Email-notifikationer (valfritt)

**Tidsåtgång**: 1 vecka

---

### Prestanda & skalbarhet ⚙️

**Backend:**

- [ ] Caching av ofta använda queries
- [ ] Database indexes för snabbare queries
- [ ] Connection pooling (vid byte till Postgres)
- [ ] API rate limiting

**Frontend:**

- [ ] Code splitting och lazy loading
- [ ] Virtualisering av långa listor
- [ ] Memoization av beräkningar
- [ ] Optimering av re-renders
- [ ] Bundle size-optimering

**Kartor:**

- [ ] Lazy loading av positions för stora tracks
- [ ] Clustering av markörer vid låg zoom
- [ ] Debouncing av kartuppdateringar

**Tidsåtgång**: 2 veckor

---

### Security & produktion 🔒

**Autentisering & Auktorisering:**

- [ ] JWT tokens för authentication
- [ ] Role-based access control (RBAC)
- [ ] API rate limiting per user
- [ ] Input validation och sanitization

**Data Protection:**

- [ ] SQL injection protection (parametriserade queries)
- [ ] XSS protection (React + CSP headers)
- [ ] HTTPS endast (redan implementerat)
- [ ] CORS-konfiguration (redan implementerat)

**Testing:**

- [ ] Backend: Unit tests för core functions
- [ ] Backend: Integration tests för API endpoints
- [ ] Frontend: Component tests (React Testing Library)
- [ ] Frontend: E2E tests (Playwright eller Cypress)
- [ ] Test coverage > 80%

**CI/CD:**

- [ ] Automatiska tester vid push
- [ ] Linting och code quality checks
- [ ] Automatisk deployment till staging
- [ ] Automatisk deployment till production
- [ ] Rollback-möjlighet
- [ ] Monitoring och alerting

**Tidsåtgång**: 3-4 veckor

---

## 🔮 Framtida möjligheter

### Machine Learning (Avancerat)

- Förutsägelse av var hund kommer gå
- Klassificering av spår (bra/dålig)
- Anomali-detektion för ovanliga mönster

### Avancerad visualisering

- 3D-visualisering av spår med elevation
- VR/AR för immersiv visning
- Animation av spår över tid

### Integration

- Garmin/Strava: Importera från fitness-appar
- Weather data: Korrelera prestanda med väder
- OpenStreetMap: Använd map data för kontext (skog, vägar, etc.)

### Mobile Apps

- Native iOS/Android app (React Native)
- Offline-first med lokal databas
- Native push notifications
- Bättre GPS-prestanda

---

## 📅 Rekommenderad tidslinje

### Vecka 1-2 (NU)

**Fokus**: GPS-förbättring och TestLab

- Dag 1-2: GPS-smoothing & filtering
- Dag 3-4: Intelligent spårjämförelse
- Dag 5-7: TestLab-förbättringar
- Dag 8-9: Visualiseringsförbättringar
- Dag 10: Dokumentation och testning

### Vecka 3-4

**Fokus**: Avancerade algoritmer

- DTW implementation
- Fréchet distance
- Heatmaps
- Dashboard

### Vecka 5-6

**Fokus**: ML-integration

- Dataanalys och förberedelse
- Enkel ML-modell
- Validering och testning
- Integration i produktion

### Vecka 7-8

**Fokus**: Produktionsklarhet

- Multi-user support (enkel version)
- Export/Import
- Historik och trendanalys
- Notifikationer

### Vecka 9-12

**Fokus**: Polish och produktion

- Performance optimization
- Security enhancements
- Comprehensive testing
- CI/CD setup
- Dokumentation

---

## 🎯 Mätpunkter för framgång

### Kort sikt (1-2 veckor)

- [ ] GPS-smoothing minskar noise med >30%
- [ ] Segment-based matching fungerar för spår med olika hastighet
- [ ] Confidence score ger rimliga resultat (validera mot manuell bedömning)
- [ ] TestLab: 50% snabbare annotering jämfört med tidigare
- [ ] Visualisering är tydligare och mer informativ

### Medellång sikt (2-4 veckor)

- [ ] DTW fungerar för spår med olika hastighet
- [ ] Fréchet distance ger rimliga similarity scores
- [ ] ML-modell har >70% accuracy på testdata
- [ ] Heatmaps visar tydliga mönster
- [ ] Dashboard ger värdefull insikt

### Lång sikt (1-3 månader)

- [ ] Multi-user fungerar med >5 samtidiga användare
- [ ] Performance: < 2s laddningstid
- [ ] Security: Inga kända sårbarheter
- [ ] Test coverage > 80%
- [ ] CI/CD fungerar smidigt

---

## ⚠️ Risker & Mitigation

### Risk: Algoritmer är för komplexa

**Mitigation**: Börja med enkla implementationer, iterera baserat på resultat

### Risk: Performance-problem vid stora datamängder

**Mitigation**: Profiling tidigt, optimera när behov uppstår, använd paginering

### Risk: ML-modell ger dåliga resultat

**Mitigation**: Börja med enkel modell, samla mer data, förbättra features iterativt

### Risk: Scope creep

**Mitigation**: Håll fokus på prioriterade uppgifter, lägg till "nice-to-have" senare

### Risk: Tekniska utmaningar

**Mitigation**: Proof-of-concept först, full implementation när vi vet att det fungerar

---

## 📚 Dokumentation

### Befintlig dokumentation

- `docs/CONTEXT.md` - Projektkontext och status
- `docs/API.md` - API-dokumentation
- `docs/HOW_IT_WORKS.md` - Teknisk översikt
- `tools/README_TILE_CONVERTER.md` - Tile converter guide
- `TEST_INSTRUCTIONS.md` - Testinstruktioner

### Uppdatera vid stora ändringar

- API-dokumentation vid nya endpoints
- HOW_IT_WORKS.md vid nya algoritmer
- TEST_INSTRUCTIONS.md vid nya funktioner

---

## 🤔 Öppna frågor för diskussion

1. **ML-modell**: Vilken typ? Linjär regression, Random Forest, XGBoost, eller Neural Network?

2. **Data requirements**: Hur mycket annoterad data behövs för träning? Minst 1000 positioner? 10000?

3. **Offline-stöd**: Utöka offline-funktionalitet till TestLab också?

4. **Prioriteringar**: Är GPS-förbättring viktigare än ML-integration just nu?

5. **Deployment**: Fortsätta med Railway eller överväga andra alternativ?

---

## 🔄 Uppdatering av denna plan

Denna plan uppdateras när:

- Nya funktioner implementeras ✅
- Prioriteringar ändras 🔄
- Nya krav uppstår 📝
- Tekniska beslut fattas 🛠️
- Efter varje sprint/vecka 📅

**Ansvarig**: Projektteam  
**Granskad senast**: 2024-11-25

---

_Denna master-plan ersätter: PLAN.md, VEKAN_PLAN.md, ROADMAP.md_
