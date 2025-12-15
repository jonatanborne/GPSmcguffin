# Feedback-logik för ML-träning

## Varför hoppar vi inte över "felaktiga" positioner?

### Viktig insikt:
**"Felaktig" feedback betyder att ML-förutsägelsen var fel, INTE att den faktiska korrigeringen är fel!**

## Scenarion

### Scenario 1: Redan korrigerat spår
**Situation:**
- Du har redan korrigerat spåret manuellt → `corrected_position` finns (t.ex. 5 meter)
- ML gör en förutsägelse → 2 meter (underskattade)
- Du ger feedback: "Felaktig" (ML-förutsägelsen var fel)

**Vad händer:**
- Den faktiska korrigeringen (5m) är KORREKT - du har manuellt justerat den
- ML-förutsägelsen (2m) var fel
- **Vi använder den faktiska korrigeringen (5m) som träningsdata** ✅
- Feedback "felaktig" betyder bara att modellen behöver lära sig bättre för denna typ av position

**Varför?**
- Den faktiska korrigeringen är "ground truth" - den är korrekt
- Modellen behöver se exempel där den gjorde fel för att lära sig
- Om vi hoppar över dessa, förlorar vi värdefull träningsdata

### Scenario 2: Nytt spår (inte korrigerat)
**Situation:**
- ML gör en förutsägelse → 3 meter
- Du ger feedback: "Felaktig" (du ser att ML-förutsägelsen är fel)
- Ingen faktisk korrigering finns

**Vad händer:**
- Vi vet inte vad den korrekta korrigeringen är
- **Vi hoppar över denna position** ❌
- Vi kan inte använda den som träningsdata eftersom vi inte vet rätt svar

### Scenario 3: Nytt spår med korrekt ML-förutsägelse
**Situation:**
- ML gör en förutsägelse → 3 meter
- Du ger feedback: "Korrekt" (ML-förutsägelsen stämmer)
- Ingen faktisk korrigering finns

**Vad händer:**
- **Vi använder ML-förutsägelsen som träningsdata** ✅
- Skapar ny träningsdata: `original_position` → `predicted_corrected_position`

## Implementerad Logik

```python
if corrected_pos exists (faktisk korrigering):
    → Använd den ALLTID, oavsett feedback
    → Feedback "felaktig" betyder bara att ML-förutsägelsen var fel
    
elif no corrected_pos but verified_status = "correct":
    → Använd ML-förutsägelsen som träningsdata
    
elif no corrected_pos and verified_status = "incorrect":
    → Hoppa över (vi vet inte vad rätt svar är)
```

## Varför detta är bättre

1. **Bevarar all värdefull data:**
   - Faktiska korrigeringar används alltid (de är "ground truth")
   - Vi förlorar inte data bara för att ML-förutsägelsen var fel

2. **Modellen lär sig från sina misstag:**
   - När modellen gör fel på en position med känd korrigering, ser den rätt svar
   - Detta hjälper modellen förbättra sig för liknande positioner

3. **Säkerställer kvalitet:**
   - Bara använder ML-förutsägelser som träningsdata när de är verifierade som korrekta
   - Hoppar över positioner där vi inte vet rätt svar

## Exempel

**Exempel 1:**
- Faktisk korrigering: 5m
- ML-förutsägelse: 2m
- Feedback: "Felaktig"
- **Använd:** 5m (faktisk korrigering) ✅

**Exempel 2:**
- Faktisk korrigering: 5m
- ML-förutsägelse: 4.8m
- Feedback: "Korrekt"
- **Använd:** 5m (faktisk korrigering) ✅

**Exempel 3:**
- Ingen faktisk korrigering
- ML-förutsägelse: 3m
- Feedback: "Korrekt"
- **Använd:** 3m (ML-förutsägelsen) ✅

**Exempel 4:**
- Ingen faktisk korrigering
- ML-förutsägelse: 3m
- Feedback: "Felaktig"
- **Hoppa över:** Vi vet inte vad rätt svar är ❌

