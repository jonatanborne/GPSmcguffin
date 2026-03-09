# FAS 1 - Öppna Frågor & Funderingar

**Syfte:** Dokumentera alla frågor och funderingar som behöver besvaras under FAS 1-implementeringen.

---

## 📋 Databas & Miljö

### ✅ Bekräftat
- **Databas:** Systemet stödjer BÅDE PostgreSQL och SQLite
  - PostgreSQL används på Railway (production)
  - SQLite används lokalt om ingen DATABASE_URL finns
  - Migration-scripts måste fungera för båda

### ❓ Öppna Frågor

1. **Vilken databas använder du just nu?**
   - [x] PostgreSQL på Railway (production)
   - [ ] SQLite lokalt (`data.db`)
   - [ ] Båda (olika miljöer)
   - **Svar:** PostgreSQL på Railway (bekräftat via verifiering 2025-01-22)

2. **Har du en testmiljö eller ska vi testa direkt i production?**
   - [ ] Testmiljö (separat databas)
   - [ ] Testa direkt i production
   - [ ] Lokal kopia av production-data
   - **Svar:** _________________

3. **Hur många spår/positioner har du i databasen nu?**
   - (För att veta om migration kan ta lång tid)
   - **Svar:** 45 tracks, 9512 positions, 9557 rader totalt (bekräftat via verifiering 2025-01-22)

---

## 🔄 Migration & Truth Levels

### ✅ Bekräftat
- Befintliga spår ska få truth levels tilldelade automatiskt
- Vi behöver INTE starta om databasen

### ❓ Öppna Frågor

4. **Truth Level T1 - Verifierat human track:**
   - Ska ALLA human tracks automatiskt få T1?
   - Eller bara de med `verified_status = 'correct'`?
   - **Svar:** Bara de med `verified_status = 'correct'` ska få T1. Human tracks som inte är verifierade ska vara T3 (rå GPS). Varför: Human tracks kan också innehålla GPS-fel, och om allt blir T1 urholkas idén med truth levels.

5. **Truth Level T0 - Manuell annotering:**
   - Hur skiljer vi mellan manuell korrigering och ML-korrigering?
   - Ska vi använda `corrected_at` timestamp för att avgöra?
   - **Svar:** Lägg till `correction_source` kolumn (enum: 'manual', 'ml', 'none'). `corrected_at` räcker inte eftersom både ML och manuell korrigering kan sätta det. T0 sätts när `correction_source = 'manual'`. Valfritt: `corrected_by` / `annotated_by` kolumn.

6. **Truth Level T2 - ML-korrigerad:**
   - När ska en position få T2?
   - Bara när ML har korrigerat OCH confidence > threshold?
   - **Svar:** T2 sätts så fort ML har producerat en korrigering, OAVSETT confidence-threshold. Confidence-threshold används för `usable_for_scoring` (om den får användas i bedömning), INTE för truth level. T2 = ML-källa, inte "bra ML". Låg confidence är fortfarande värdefull (debug, active learning, visualisering). **VIKTIGT:** ML kan korrigera BÅDE human tracks OCH dog tracks (GPS kan ha fel oavsett vem som bär enheten). Om ML korrigerar ett human track → T2 (inte T1).

---

## 🎯 Confidence Scores

### ❓ Öppna Frågor

7. **Hur ska confidence beräknas?**
   - [ ] Prediction variance/uncertainty från modellen
   - [ ] Ensemble methods (flera modeller)
   - [ ] Feature-based confidence (baserat på input-kvalitet)
   - [ ] Kombination av ovanstående
   - **Svar:** _________________

8. **Confidence-trösklar:**
   - Är dessa trösklar okej?
     - `>= 0.8`: Hög, acceptera automatiskt
     - `0.5 - 0.8`: Måttlig, kräver granskning
     - `< 0.5`: Låg, kräver manuell korrigering
   - **Svar:** _________________

---

## 🏆 Tävlingar & Modellversionering

### ❓ Öppna Frågor

9. **Tävlingslåsning:**
   - När ska en tävling låsas?
   - [ ] Automatiskt vid startdatum
   - [ ] Manuellt av admin
   - [ ] När första spår skapas för tävlingen
   - **Svar:** _________________

10. **Modellversionering:**
    - Vilken versioning-strategi ska vi använda?
    - [ ] Semantic versioning (v1.2.3)
    - [ ] Datum-baserad (2025-01-15)
    - [ ] Git commit hash
    - **Svar:** _________________

---

## 📊 Segmentbaserad Jämförelse

### ❓ Öppna Frågor

11. **Segment-längd:**
    - Hur långa ska segmenten vara?
    - [ ] Fast längd (t.ex. 10 positioner)
    - [ ] Dynamisk baserat på rörelse (stopp/start)
    - [ ] Baserat på riktningsförändring
    - **Svar:** _________________

---

## 🔍 Pipeline-separation

### ❓ Öppna Frågor

12. **Pipeline-ordning:**
    - I vilken ordning ska pipelines köras?
    - Data → ML → Assessment?
    - Eller kan de köras parallellt?
    - **Svar:** _________________

---

## 📝 TestLab & Audit Trail

### ❓ Öppna Frågor

13. **Audit Trail - User ID:**
    - Hur identifierar vi användare?
    - [ ] IP-adress
    - [ ] Session ID
    - [ ] Användarnamn (om autentisering finns)
    - [ ] Ingen identifiering (bara timestamp)
    - **Svar:** _________________

14. **Audit Trail - Vad ska loggas?**
    - [ ] Alla ändringar av positioner
    - [ ] Bara manuella korrigeringar
    - [ ] Bara ML-godkännande/underkännande
    - [ ] Allt ovanstående
    - **Svar:** _________________

---

## 🚀 Deployment & Backup

### ❓ Öppna Frågor

15. **Backup-strategi:**
    - Var ska backups sparas?
    - [ ] Lokalt i projektet
    - [ ] Separat backup-mapp
    - [ ] Cloud storage (t.ex. Railway volumes)
    - **Svar:** _________________

16. **Rollback-plan:**
    - Om migration går fel, hur återställer vi?
    - [ ] Från backup
    - [ ] Rollback-migration script
    - [ ] Båda
    - **Svar:** _________________

---

## 📅 Prioritering

### ❓ Öppna Frågor

17. **Vilken ordning ska vi implementera i?**
    - Rekommenderad ordning i FAS1_HANDOFF.md:
      1. Grundläggande struktur (databasändringar)
      2. Truth levels
      3. Pipeline-separation
      4. Confidence scores
      5. Segmentbaserad jämförelse
      6. TestLab-förbättringar
      7. Modellversionering
    - Är denna ordning okej?
    - **Svar:** _________________

---

## 📝 Anteckningar

**Datum:** 2025-01-22  
**Uppdaterad av:** Användare (Truth Levels specifikation)

---

**Användning:**
- Fyll i svar allt eftersom frågor uppstår
- Uppdatera detta dokument när beslut fattas
- Referera till detta dokument vid implementering
