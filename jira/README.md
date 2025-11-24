# Jira Import - Dogtracks Geofence Kit

Denna mapp innehåller filer för att importera projektstruktur till Jira.

## Fil: jira-import.csv

CSV-filen innehåller alla issues (Epics, Stories, Tasks) strukturerade enligt projektplanen i `PLAN.md`.

## Struktur

### Issue Types
- **Epic**: Större områden (Tile-hantering, Annoteringsflöde, ML-integration, etc.)
- **Story**: Funktioner inom varje epic
- **Task**: Specifika uppgifter inom stories

### Prioritering
- **Highest**: Högsta prioritet (Kort sikt - 1-2 veckor)
- **Medium**: Medel prioritet (Medellång sikt - 2-4 veckor)
- **Low**: Låg prioritet (Lång sikt - 1-3 månader)
- **Low-Medium**: Låg-medel prioritet

### Story Points
Story points använder Fibonacci-sekvensen (1, 2, 3, 5, 8, 13, 21) för uppskattning av arbetsinsats.

## Hur man importerar till Jira

### Metod 1: CSV Import (Rekommenderas)

1. **Öppna Jira** och gå till ditt projekt
2. **Gå till projekt-inställningar** → Issues
3. **Välj "Import Issues from CSV"** eller liknande alternativ
4. **Ladda upp** `jira-import.csv`
5. **Mappa kolumner**:
   - Issue Type → Issue Type
   - Summary → Summary
   - Description → Description
   - Priority → Priority
   - Labels → Labels
   - Epic Link → Epic Link (om tillgängligt)
   - Story Points → Story Points (om tillgängligt)
6. **Importera** issues

### Metod 2: Manuell import via Bulk Create

1. Öppna `jira-import.csv` i Excel eller Google Sheets
2. Kopiera rader och använd Jira's bulk create-funktion
3. Skapa issues manuellt med information från CSV-filen

### Metod 3: Jira API

Om du vill automatisera importen kan du använda Jira REST API:

```python
import csv
import requests
from jira import JIRA

# Anslut till Jira
jira = JIRA('https://your-domain.atlassian.net', 
            basic_auth=('email', 'api-token'))

# Läs CSV och skapa issues
with open('jira-import.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        issue_dict = {
            'project': {'key': 'DTGK'},  # Ändra till ditt projekt-nyckel
            'summary': row['Summary'],
            'description': row['Description'],
            'issuetype': {'name': row['Issue Type']},
            'priority': {'name': row['Priority']},
            'labels': [label.strip() for label in row['Labels'].split(',')]
        }
        jira.create_issue(fields=issue_dict)
```

## Anpassa innan import

### Projket-nyckel
Om du har ett annat projekt-nyckel i Jira, uppdatera CSV-filen eller använd Jira's mappningsfunktioner vid import.

### Prioriteringar
Om ditt Jira använder andra prioritetsnivåer (t.ex. Critical, High, Medium, Low), uppdatera CSV-filen:
- Highest → Critical eller High
- Medium → Medium
- Low → Low

### Epic Links
Epic Link-kolumnen länkar stories till epics. Om Jira kräver epic-nycklar istället för namn, skapa epics först och uppdatera CSV med epic-nycklar.

## Efter import

1. **Kontrollera Epics**: Se till att alla epics skapades korrekt
2. **Verifiera Epic Links**: Kontrollera att stories är länkade till rätt epics
3. **Lägg till Acceptance Criteria**: Lägg till acceptance criteria för stories
4. **Sätt Sprint Goals**: Gruppera issues i sprints baserat på prioritet
5. **Tilldela Issues**: Tilldela issues till team-medlemmar

## Uppdatering av CSV

När nya issues läggs till i projektet:

1. Uppdatera `PLAN.md` först
2. Lägg till nya rader i `jira-import.csv` med samma format
3. Använd Jira's bulk import för att lägga till nya issues

## Tips

- **Epic-namn**: Epic-namnen i CSV matchar epic-namnen i Epic Link-kolumnen
- **Labels**: Flera labels separeras med komma (t.ex. "Tile Management, Frontend")
- **Story Points**: Kan vara tomt för epics, men bör fyllas i för stories och tasks
- **Description**: Innehåller detaljerad beskrivning av vad som ska göras

## Support

Om du har problem med importen:
1. Kontrollera att alla obligatoriska kolumner finns i din Jira-installation
2. Se till att Issue Types matchar (Epic, Story, Task måste existera i Jira)
3. Verifiera att Priority-värden matchar dina Jira-prioriteringar

