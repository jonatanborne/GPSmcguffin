# Steg-för-steg guide: Importera till Jira

## Metod 1: Jira CSV Importer (Rekommenderas)

### För Jira Cloud

1. **Öppna ditt projekt i Jira**
   - Gå till `https://your-domain.atlassian.net`
   - Välj ditt projekt

2. **Öppna Bulk Operations**
   - Klicka på **"..."** (tre prickar) i övre högra hörnet
   - Välj **"Import issues from CSV"**
   
   **Alternativt:**
   - Gå till projektet → **Project settings** (⚙️ ikon)
   - Välj **"Import issues from CSV"** under Tools

3. **Ladda upp CSV-fil**
   - Klicka **"Choose File"** eller **"Upload"**
   - Välj `jira-import.csv` från projektet
   - Klicka **"Next"**

4. **Välj projekt och map-kolumner**
   - **Project**: Välj ditt projekt (t.ex. "Dogtracks Geofence Kit")
   - Jira kommer automatiskt försöka mappa kolumner
   - **Kontrollera mappning:**
     - `Issue Type` → Issue Type
     - `Summary` → Summary
     - `Description` → Description
     - `Priority` → Priority
     - `Labels` → Labels
     - `Epic Link` → Epic Link (om tillgängligt)
     - `Story Points` → Story Points (om tillgängligt)
   - Klicka **"Next"**

5. **Välj Import-strategi**
   - Välj hur du vill hantera dubletter (vanligtvis **"Create new issues"**)
   - Klicka **"Next"**

6. **Förhandsgranska och importera**
   - Kontrollera förhandsvisningen
   - Om allt ser bra ut, klicka **"Begin Import"**
   - Vänta tills importen är klar (kan ta några minuter för 90+ issues)

7. **Verifiera importen**
   - Klicka på länken för att se importerade issues
   - Kontrollera att alla epics skapades
   - Verifiera att stories är länkade till rätt epics

---

### För Jira Server/Data Center

1. **Öppna ditt projekt i Jira**

2. **Öppna Bulk Operations**
   - Gå till **"Issues"** → **"Import Issues"**
   - Eller: **Administration** → **System** → **External System Import** → **CSV**

3. **Välj projekt**
   - Välj ditt projekt från dropdown-menyn

4. **Ladda upp CSV-fil**
   - Klicka **"Choose File"**
   - Välj `jira-import.csv`
   - Klicka **"Next"**

5. **Map-kolumner** (samma som ovan)
   - Mappa kolumner manuellt om nödvändigt
   - Klicka **"Next"**

6. **Förhandsgranska och importera**
   - Granska förhandsvisningen
   - Klicka **"Begin Import"**

---

## Metod 2: CSV Importer App (Om inbyggd import saknas)

Om din Jira-installation inte har inbyggd CSV-import:

1. **Installera CSV Importer App**
   - Gå till **Atlassian Marketplace**
   - Sök efter "CSV Importer" eller "CSV Upload"
   - Installera appen (t.ex. "CSV & Excel Importer" av Appfire)

2. **Använd appen**
   - Följ appens instruktioner för att importera CSV-filen

---

## Metod 3: Importera i två steg (Om Epic Links inte fungerar)

Om Epic Link-kolumnen inte fungerar vid direkt import:

### Steg 1: Importera Epics först

1. **Skapa en temporär CSV med bara epics:**
   ```csv
   Issue Type,Summary,Description,Priority,Labels
   Epic,Förbättring av Tile-hantering,"Gör det enklare att använda förstorade tiles i appen.",Highest,Tile Management
   Epic,Förbättring av Annoteringsflöde,"Gör TestLab ännu mer effektivt för att samla in annoteringsdata.",Highest,TestLab Annotation
   ...
   ```

2. **Importera epics**
   - Följ Metod 1 ovan
   - Spara epic-nycklarna (t.ex. DTGK-1, DTGK-2, etc.)

3. **Exportera epics från Jira**
   - Gå till Issues → Filter → Create filter
   - Issue Type = Epic
   - Exportera till CSV för att få epic-nycklar

### Steg 2: Uppdatera CSV och importera resten

1. **Uppdatera jira-import.csv**
   - Ersätt epic-namnen i "Epic Link"-kolumnen med epic-nycklarna
   - T.ex. "Förbättring av Tile-hantering" → "DTGK-1"

2. **Importera stories och tasks**
   - Följ Metod 1 ovan
   - Nu kommer Epic Links fungera korrekt

---

## Metod 4: Använda Jira REST API (För automatisering)

Om du vill automatisera eller har många issues att importera:

### Python-script

1. **Installera Jira-biblioteket:**
   ```bash
   pip install jira
   ```

2. **Skapa import-script:**
   ```python
   from jira import JIRA
   import csv

   # Anslut till Jira
   jira = JIRA(
       server='https://your-domain.atlassian.net',
       basic_auth=('your-email@example.com', 'your-api-token')
   )

   # Projekt-nyckel
   PROJECT_KEY = 'DTGK'  # Ändra till ditt projekt-nyckel

   # Läs CSV och skapa issues
   epic_map = {}  # För att mappa epic-namn till epic-nycklar

   with open('jira-import.csv', 'r', encoding='utf-8') as f:
       reader = csv.DictReader(f)
       
       for row in reader:
           issue_dict = {
               'project': {'key': PROJECT_KEY},
               'summary': row['Summary'],
               'description': row['Description'] or '',
               'issuetype': {'name': row['Issue Type']},
               'priority': {'name': row['Priority']},
               'labels': [label.strip() for label in row['Labels'].split(',') if label.strip()],
           }
           
           # Lägg till story points om det finns
           if row['Story Points'] and row['Story Points'].strip():
               issue_dict['customfield_10016'] = int(row['Story Points'])  # Anpassa field-id
           
           # Skapa issue
           if row['Issue Type'] == 'Epic':
               issue = jira.create_issue(fields=issue_dict)
               # Spara epic-nyckel för senare användning
               epic_map[row['Summary']] = issue.key
               print(f"Skapade Epic: {issue.key} - {row['Summary']}")
           else:
               # Lägg till Epic Link om det finns
               if row['Epic Link'] and row['Epic Link'].strip():
                   epic_name = row['Epic Link']
                   if epic_name in epic_map:
                       issue_dict['customfield_10011'] = epic_map[epic_name]  # Epic Link field-id
               
               issue = jira.create_issue(fields=issue_dict)
               print(f"Skapade {row['Issue Type']}: {issue.key} - {row['Summary']}")

   print(f"\nImport klar! Totalt {len(epic_map)} epics skapade.")
   ```

3. **Kör scriptet:**
   ```bash
   python import_to_jira.py
   ```

**Viktigt:** Du behöver:
- **API-token** från Jira (klicka på din profil → Account Settings → Security → API Tokens)
- **Custom Field IDs** för Story Points och Epic Link (hitta dem i Jira Settings → Issues → Custom Fields)

---

## Felsökning

### Problem: "Epic Link column not found"
**Lösning:** Epic Link kanske heter annat i din Jira. Kolla vad epic-länkningsfältet heter:
- Epic Link
- Parent Link
- Epic Name (för Jira Cloud)

### Problem: "Priority values don't match"
**Lösning:** Kolla dina Jira-prioriteringar:
1. Gå till **Settings** → **Issues** → **Priorities**
2. Uppdatera CSV-filen med rätt prioritetsnamn:
   - Highest → Highest, High, Critical (beroende på Jira)
   - Medium → Medium
   - Low → Low

### Problem: "Issue Type not found"
**Lösning:** Se till att Epic, Story och Task finns i projektet:
1. Gå till **Project Settings** → **Issue Types**
2. Lägg till saknade Issue Types om nödvändigt

### Problem: "Story Points field not found"
**Lösning:** 
- Story Points är ofta en custom field
- Antingen hoppa över den, eller kontrollera field-id i Jira Settings

### Problem: "Character encoding issues" (svenska tecken)
**Lösning:** 
- Se till att CSV-filen är sparad som UTF-8
- Öppna CSV i text editor och spara som UTF-8 om nödvändigt

---

## Efter lyckad import

1. ✅ **Kontrollera Epics**
   - Gå till **Backlog** → **Epics**
   - Se till att alla 16 epics finns

2. ✅ **Verifiera Epic Links**
   - Öppna en story/task
   - Kontrollera att den är länkad till rätt epic

3. ✅ **Kontrollera Labels**
   - Öppna ett issue
   - Verifiera att labels är korrekt applicerade

4. ✅ **Kontrollera Prioriteringar**
   - Verifiera att prioriteter är korrekt satta

5. ✅ **Lägg till Acceptance Criteria**
   - För stories, lägg till acceptance criteria manuellt eller via bulk edit

---

## Tips

- **Importera i små batchar:** Om du har problem, testa att importera bara epics först
- **Backup före import:** Exportera befintliga issues först om du har några
- **Testa med ett issue:** Importera ett test-issue först för att verifiera formatet
- **Använd samma projekt:** Importera allt till samma projekt för att Epic Links ska fungera

---

## Snabbstart för vanligaste scenariot

**Jira Cloud med inbyggd CSV-import:**

1. Projekt → "..." → "Import issues from CSV"
2. Välj `jira-import.csv`
3. Välj projekt
4. Klicka "Next" tills importen börjar
5. Klart! ✅

