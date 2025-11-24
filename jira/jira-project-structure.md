# Jira Projektstruktur - Dogtracks Geofence Kit

Detta dokument beskriver den rekommenderade strukturen för Jira-projektet.

## Projektöversikt

**Projektnamn**: Dogtracks Geofence Kit  
**Projektnyckel**: DTGK (eller anpassa efter ditt projekt)  
**Projekttyp**: Software Development (Scrum eller Kanban)

## Issue Types

### Epics (8 st)
Större funktionsområden som grupperar flera stories och tasks.

1. **Förbättring av Tile-hantering** (Highest)
2. **Förbättring av Annoteringsflöde** (Highest)
3. **Datakvalitet och Validering** (Medium)
4. **ML-Modell Integration** (Medium)
5. **Förbättrad Visualisering** (Low-Medium)
6. **Prestanda och Skalbarhet** (Medium)
7. **Avancerade Funktioner** (Low)
8. **Tekniska Förbättringar** (Medium)

### Stories (24 st)
Funktioner inom varje epic som levererar värde.

### Tasks (~50 st)
Specifika tekniska uppgifter som behövs för att slutföra stories.

## Labels

Följande labels används för att kategorisera issues:

### Funktionella
- `Tile Management` - Tile-relaterade issues
- `TestLab Annotation` - TestLab och annotering
- `Data Quality` - Datakvalitet och validering
- `ML Machine Learning` - Machine learning-funktioner
- `Visualization` - Visualisering och UI
- `Performance` - Prestanda och optimering
- `Advanced Features` - Avancerade funktioner

### Tekniska
- `Backend` - Backend-relaterade issues
- `Frontend` - Frontend-relaterade issues
- `Database` - Databas-relaterade issues
- `Tools` - Verktyg och scripts
- `UI` - Användargränssnitt
- `API` - API-relaterade issues
- `DevOps` - DevOps och deployment

### Kombinerade
- `Tile Management Frontend` - Tile-hantering i frontend
- `Tile Management Tools` - Tile-verktyg
- `Tile Management UI` - Tile UI-förbättringar
- `TestLab Annotation Dashboard` - Dashboard i TestLab
- `TestLab Annotation Navigation` - Navigering i TestLab
- `Data Quality Validation` - Datavalidering
- `Data Quality ML Export` - ML-export
- `ML Machine Learning` - ML-relaterat
- `Visualization UI` - Visualisering
- `Performance Optimization` - Prestanda
- `Performance Optimization Database` - Databas-prestanda
- `Performance Optimization Frontend` - Frontend-prestanda
- `Advanced Features Mobile` - Mobilapp
- `Advanced Features API` - Externa API:er
- `Tech Improvements Backend` - Backend-förbättringar
- `Tech Improvements Frontend` - Frontend-förbättringar
- `Tech Improvements DevOps` - DevOps-förbättringar

## Prioriteringar

- **Highest**: Kort sikt (1-2 veckor) - Kritiska förbättringar
- **Medium**: Medellång sikt (2-4 veckor) - Viktiga funktioner
- **Low**: Lång sikt (1-3 månader) - Framtida funktioner
- **Low-Medium**: Flexibel prioritet

## Sprint-struktur (Rekommendation)

### Sprint 1 (Vecka 1-2) - Tile-hantering och Annotering
**Mål**: Förbättra grundläggande funktionalitet

- Epic: Förbättring av Tile-hantering
  - Stories: Automatisk detektering, Tile converter, UI-förbättringar
- Epic: Förbättring av Annoteringsflöde
  - Stories: Visuell feedback, Statistik, Navigering

### Sprint 2 (Vecka 3-4) - Datakvalitet
**Mål**: Säkerställ datakvalitet

- Epic: Datakvalitet och Validering
  - Stories: Automatisk validering, Kvalitetsmätningar, Export

### Sprint 3 (Vecka 5-8) - ML och Visualisering
**Mål**: Börja med ML och förbättra visualisering

- Epic: ML-Modell Integration
  - Stories: Dataanalys, Korrigeringsmodell, Validering
- Epic: Förbättrad Visualisering
  - Stories: Heatmap, Track-visualisering, Analysverktyg

### Sprint 4 (Vecka 9-12) - Prestanda och Tekniska Förbättringar
**Mål**: Optimera och förbättra infrastruktur

- Epic: Prestanda och Skalbarhet
  - Stories: Kartoptimering, Databasoptimering, Frontend-prestanda
- Epic: Tekniska Förbättringar
  - Stories: Backend-förbättringar, Frontend-förbättringar, DevOps

### Framtida Sprints - Avancerade Funktioner
**Mål**: Långsiktiga funktioner

- Epic: Avancerade Funktioner
  - Stories: Flera användare, Mobilapp, Externa API:er

## Komponenter (Rekommendation)

Skapa komponenter i Jira för olika delar av systemet:

- **Backend**
- **Frontend**
- **TestLab**
- **GeofenceEditor**
- **Tile Converter**
- **Database**
- **API**
- **ML/Data Science**

## Fix Versions / Releases

Skapa fix versions för planerade releases:

- **v1.1** - Tile-hantering och Annotering (Sprint 1)
- **v1.2** - Datakvalitet (Sprint 2)
- **v1.3** - ML Beta (Sprint 3)
- **v1.4** - Prestanda (Sprint 4)
- **v2.0** - Avancerade Funktioner (Framtida)

## Custom Fields (Rekommendation)

Överväg att lägga till custom fields:

- **Story Points**: För uppskattning (finns redan i CSV)
- **Acceptance Criteria**: För stories
- **Technical Notes**: För tekniska detaljer
- **Related Files**: Länkar till koden

## Workflow (Rekommendation)

Standard Scrum/Kanban workflow:

1. **Backlog** - Issues som väntar på att tas upp
2. **To Do** - Issues som är planerade för nuvarande sprint
3. **In Progress** - Issues som arbetas med
4. **In Review** - Issues som väntar på code review/test
5. **Done** - Klara issues

## Dashboard Widgets (Rekommendation)

Skapa dashboard-widgets för att följa projektet:

- **Sprint Burndown Chart** - Sprint-förlopp
- **Epic Progress** - Förlopp per epic
- **Issue Distribution** - Issues per priority/status
- **Velocity Chart** - Team velocity över tid
- **Release Burndown** - Release-förlopp

## Automation Rules (Rekommendation)

Överväg att automatisera:

- Automatisk tilldelning baserat på labels
- Status-uppdateringar baserat på transitions
- Notifikationer vid status-ändringar
- Auto-linking av related issues

## Rapportering

### Veckovis
- Sprint-förlopp
- Blocked issues
- Risker och problem

### Månadsvis
- Epic-förlopp
- Velocity-trend
- Release-förlopp

## Tips för team

1. **Prioritera Epics**: Börja med Highest-prioriterade epics
2. **Bryt ned Stories**: Dela upp stora stories i mindre tasks
3. **Uppdatera regelbundet**: Uppdatera story points och status
4. **Använd Labels**: Tagga issues för enkel filtrering
5. **Epic Links**: Se till att stories är länkade till epics
6. **Acceptance Criteria**: Lägg till tydliga kriterier för stories
7. **Retrospektiv**: Använd Jira för att följa upp sprint-retrospektiv

## Ytterligare Anpassningar

Anpassa strukturen efter ditt teams behov:
- Lägg till fler labels om behövs
- Skapa custom fields för specifika behov
- Anpassa workflow efter teams processer
- Lägg till fler komponenter om projektet växer

