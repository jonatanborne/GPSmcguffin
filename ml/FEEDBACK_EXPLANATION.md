# Hur Feedback Fungerar i ML-modellen

## Nuvarande Situation

### Vad händer nu?

1. **Redan korrigerade spår:**
   - Du har redan korrigerat spåret manuellt i TestLab
   - Den korrigerade positionen finns i databasen (`corrected_lat`, `corrected_lng`)
   - `correction_distance_meters` beräknas från original → korrigerad position

2. **ML-förutsägelse på redan korrigerat spår:**
   - Modellen förutsäger en korrigering baserat på original positionen
   - Vi jämför ML-förutsägelsen med den faktiska korrigeringen
   - Du ger feedback: "Korrekt" eller "Felaktig"

3. **Problemet:**
   - Feedback sparas i databasen (`verified_status`)
   - Men modellen använder **INTE** feedback i träningen ännu!
   - Modellen tränas bara på positioner med `corrected_position`

## Vad Modellen Lär Sig Just Nu

Modellen tränas på:
- **Input (features):** GPS accuracy, position, hastighet, etc.
- **Output (target):** `correction_distance_meters` (avståndet från original till korrigerad position)

Modellen lär sig: "När GPS accuracy är X och hastighet är Y, behöver positionen korrigeras Z meter"

## Vad Feedback Borde Göra

### Scenario 1: ML-förutsägelse på NYTT spår (inte korrigerat ännu)
- ML-förutsägelsen: "Korrigera 3 meter"
- Du ger feedback: "Korrekt" → **Använd ML-förutsägelsen som träningsdata!**
  - Lägg till: `original_position` → `predicted_corrected_position` med `correction_distance = 3m`
- Du ger feedback: "Felaktig" → **Hoppa över eller markera som dålig data**

### Scenario 2: ML-förutsägelse på REDAN KORRIGERAT spår
- Faktisk korrigering: 5 meter
- ML-förutsägelsen: 4.8 meter (nästan rätt!)
- Du ger feedback: "Korrekt" → **Modellen gjorde rätt, använd faktiska korrigeringen som träningsdata**
- Du ger feedback: "Felaktig" → **Modellen gjorde fel, använd faktiska korrigeringen men markera som problemområde**

## Förbättringar Som Behövs

### 1. Använd Feedback i Träningen

**Alternativ A: Filtrera baserat på feedback**
- Bara träna på positioner med `verified_status = 'correct'`
- Hoppa över positioner med `verified_status = 'incorrect'`

**Alternativ B: Viktläggning baserat på feedback**
- Ge högre vikt åt positioner med `verified_status = 'correct'`
- Ge lägre vikt åt positioner med `verified_status = 'incorrect'`

**Alternativ C: Lägg till ML-förutsägelser som träningsdata**
- Om ML-förutsägelsen var "correct", använd den som träningsdata
- Skapa ny träningsdata: `original_position` → `predicted_corrected_position`

### 2. Förbättrad Export

Export-funktionen behöver:
- Inkludera ML-förutsägelser markerade som "correct"
- Skapa `corrected_position` från ML-förutsägelsen om den saknas
- Filtrera bort positioner markerade som "incorrect"

## Rekommendation

**Bästa lösningen:** Kombinera Alternativ A och C

1. **För redan korrigerade spår:**
   - Om `verified_status = 'correct'` → Använd den faktiska korrigeringen som träningsdata
   - Om `verified_status = 'incorrect'` → Hoppa över (dålig data)

2. **För nya spår med ML-förutsägelser:**
   - Om `verified_status = 'correct'` → Använd ML-förutsägelsen som träningsdata
   - Skapa `corrected_position` från `predicted_corrected_position`
   - Om `verified_status = 'incorrect'` → Hoppa över

3. **För positioner utan feedback:**
   - Använd som vanligt (bakåtkompatibilitet)

## Implementation

Se `ml/analysis.py` för implementation av feedback-filtrering.

