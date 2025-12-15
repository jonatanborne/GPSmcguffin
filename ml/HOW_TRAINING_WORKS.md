# Hur ML-modellen Tränas och Lär Sig från Dina Justeringar

## 📚 Översikt

ML-modellen lär sig genom att jämföra sina förutsägelser med dina faktiska justeringar. Processen fungerar i två steg:

1. **Förutsägelse**: Modellen gör en gissning baserat på GPS-data
2. **Jämförelse**: Modellen ser hur nära den var ditt faktiska svar
3. **Träning**: Modellen anpassar sig för att göra bättre förutsägelser nästa gång

---

## 🔄 Steg 1: Initial Träning (Första gången)

### Vad händer:
1. Du exporterar dina **redan korrigerade spår** från TestLab
2. Modellen läser JSON-filen med:
   - Original positioner (`original_position`)
   - Dina korrigerade positioner (`corrected_position`)
   - Korrigeringsavstånd (`correction_distance_meters`)

### Exempel:
```json
{
  "original_position": {"lat": 59.3660, "lng": 17.9911},
  "corrected_position": {"lat": 59.3661, "lng": 17.9910},
  "correction_distance_meters": 5.21,
  "accuracy": 14.92
}
```

### Vad modellen lär sig:
- **Input**: GPS accuracy = 14.92m, position, hastighet, etc.
- **Output**: Korrigering behövs = 5.21 meter
- **Lärdom**: "När GPS accuracy är ~15m, behöver positionen korrigeras ~5 meter"

---

## 🔮 Steg 2: Förutsägelse (När du testar modellen)

### Vad händer:
1. Du klickar "Hämta ML-förutsägelser" i TestLab
2. Modellen gör en förutsägelse för varje position:
   - Läser GPS-data (accuracy, position, hastighet, etc.)
   - Använder tränad modell → förutsäger korrigeringsavstånd
   - Beräknar förutsagd korrigerad position

### Exempel:
```
Position #123:
- Original: 59.3660, 17.9911
- ML-förutsägelse: "Korrigera 4.8 meter"
- Faktisk korrigering (din justering): 5.21 meter
- Fel: |4.8 - 5.21| = 0.41 meter
```

### Vad modellen ser:
- **Förutsägelse**: 4.8 meter
- **Faktiskt**: 5.21 meter
- **Fel**: 0.41 meter (modellen var nästan rätt!)

---

## 📊 Steg 3: Jämförelse och Feedback

### När du ger feedback:

#### Scenario A: Redan korrigerat spår
```
Faktisk korrigering: 5.21 meter
ML-förutsägelse: 4.8 meter
Skillnad: 0.41 meter

Du klickar "✅ Korrekt":
→ Modellen gjorde nästan rätt (0.41m fel är acceptabelt)
→ Den faktiska korrigeringen (5.21m) används som träningsdata vid reträning
```

#### Scenario B: Nytt spår (ingen korrigering ännu)
```
ML-förutsägelse: 3.2 meter
Ingen faktisk korrigering finns

Du klickar "✅ Korrekt":
→ ML-förutsägelsen (3.2m) används som träningsdata vid reträning
→ Modellen lär sig: "Denna typ av position behöver ~3.2m korrigering"
```

#### Scenario C: Felaktig förutsägelse
```
ML-förutsägelse: 1.5 meter
Faktisk korrigering: 8.3 meter
Skillnad: 6.8 meter (stort fel!)

Du klickar "❌ Felaktig":
→ Om det finns faktisk korrigering: Använd den vid reträning (modellen behöver lära sig)
→ Om ingen korrigering finns: Hoppa över (vi vet inte vad rätt svar är)
```

---

## 🎓 Steg 4: Reträning (När modellen förbättras)

### Vad händer:
1. Du exporterar feedback-data (alla positioner med feedback)
2. Modellen tränas om med:
   - Alla tidigare korrigerade spår
   - Alla ML-förutsägelser markerade som "korrekt"
   - Alla nya spår du korrigerat

### Exempel på träningsdata:
```json
[
  {
    "original_position": {"lat": 59.3660, "lng": 17.9911},
    "corrected_position": {"lat": 59.3661, "lng": 17.9910},
    "correction_distance_meters": 5.21,
    "verified_status": "correct"  // ← Din feedback
  },
  {
    "original_position": {"lat": 59.3670, "lng": 17.9920},
    "corrected_position": {"lat": 59.3671, "lng": 17.9919},  // ← Från ML-förutsägelse
    "correction_distance_meters": 3.2,
    "verified_status": "correct"  // ← Du sa att ML-förutsägelsen var korrekt
  }
]
```

### Vad modellen lär sig:
- **Förbättring**: Modellen justerar sina vikter baserat på alla exempel
- **Resultat**: Nästa gång gör modellen bättre förutsägelser för liknande positioner

---

## 📈 Mätvärden för Framgång

### Vid förutsägelse:
- **Prediction Error**: Skillnaden mellan ML-förutsägelse och faktisk korrigering
  - `< 0.5m` = Mycket bra! ✅
  - `0.5-1.0m` = Bra ✅
  - `1.0-2.0m` = Acceptabelt ⚠️
  - `> 2.0m` = Dåligt ❌

### Vid träning:
- **MAE (Mean Absolute Error)**: Genomsnittligt fel i meter
  - `< 0.5m` = Mycket bra modell
  - `0.5-1.0m` = Bra modell
  - `> 1.0m` = Modellen behöver mer träning

- **R² Score**: Hur väl modellen förklarar variationen
  - `> 0.9` = Mycket bra (90%+ förklarad varians)
  - `0.7-0.9` = Bra
  - `< 0.7` = Modellen behöver förbättras

---

## 🔍 Praktiskt Exempel

### Situation:
Du har justerat ett spår med 50 positioner. Modellen gör förutsägelser på samma spår.

### Process:
1. **Förutsägelse**: Modellen förutsäger korrigering för varje position
2. **Jämförelse**: Backend beräknar `prediction_error` för varje position:
   ```python
   prediction_error = abs(
       predicted_correction_distance - actual_correction_distance
   )
   ```
3. **Visning**: Du ser i UI:
   - Förutsägelse: 4.8m
   - Faktisk: 5.21m
   - Fel: 0.41m ✅ (bra!)
4. **Feedback**: Du klickar "✅ Korrekt" för positioner där felet är liten
5. **Export**: Du exporterar feedback-data
6. **Reträning**: Modellen tränas om med alla exempel
7. **Förbättring**: Nästa gång gör modellen bättre förutsägelser!

---

## 💡 Viktiga Punkter

1. **Modellen ändrar INGET i dina spår** när den gör förutsägelser
   - Den bara läser data och gör beräkningar
   - Resultatet sparas i en JSON-fil (inte i databasen)

2. **Feedback är viktigt för förbättring**
   - Ju mer feedback, desto bättre modell
   - Både "korrekt" och "felaktig" feedback hjälper

3. **Reträning gör modellen bättre**
   - Varje gång du tränar om modellen med ny data blir den bättre
   - Jämför MAE och R² Score för att se förbättringar

4. **Modellen lär sig från dina justeringar**
   - Varje korrigering du gör blir ett exempel för modellen
   - Modellen generaliserar från dina exempel till nya positioner

---

## 🚀 Nästa Steg

För att förbättra modellen:
1. Ge feedback på ML-förutsägelser (både korrekta och felaktiga)
2. Exportera feedback-data regelbundet
3. Träna om modellen med `python ml/analysis.py`
4. Jämför resultat (MAE, R² Score) för att se förbättringar

