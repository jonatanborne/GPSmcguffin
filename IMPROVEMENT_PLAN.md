# Förbättringsplan: TestLab & ML-modell

## 📊 Nuvarande Status

### TestLab (Annoteringsmiljö)
**Vad fungerar bra:**
- ✅ Manuell korrigering av GPS-positioner
- ✅ Batch-justeringsläge för effektiv massjustering
- ✅ Snapping till närmaste position
- ✅ Anteckningar per position
- ✅ Navigering mellan positioner
- ✅ Lokal tile layer integration (högupplösta kartor)
- ✅ Välja 2 spår (människaspår + hundspår) som hör ihop
- ✅ Exportera data för ML-träning

**Vad kan förbättras:**
- ⚠️ Ingen automatisk kvalitetskontroll av korrigeringar
- ⚠️ Ingen visuell indikator på korrigeringskvalitet
- ⚠️ Ingen batch-feedback på ML-förutsägelser
- ⚠️ Ingen jämförelse mellan manuella och ML-korrigeringar direkt i TestLab

### ML-modell
**Vad fungerar bra:**
- ✅ 30 features (GPS, position, kontext, rörelse, historik, miljö)
- ✅ Flera modeller testade (Random Forest, Gradient Boosting, Extra Trees, XGBoost)
- ✅ Hyperparameter tuning
- ✅ Cross-validation
- ✅ Feedback-loop implementerad
- ✅ Prediction utan att ändra databasen
- ✅ Visualisering på karta med filter
- ✅ Stöd för 1-2 spår samtidigt

**Vad kan förbättras:**
- ⚠️ Ingen automatisk reträning när feedback finns
- ⚠️ Ingen modellversionering
- ⚠️ Ingen A/B-testing av modellversioner
- ⚠️ Ingen active learning (föreslår vilka positioner som behöver feedback)
- ⚠️ Begränsad feature engineering (saknar satellitdata, HDOP, etc.)

---

## 🎯 Förbättringsplan (Prioriterad)

### FASE 1: Grundläggande förbättringar (1-2 veckor) ⚡ HÖG PRIORITET

#### 1.1 TestLab: ML-integration
**Mål:** Se ML-förutsägelser direkt i TestLab för snabbare arbetsflöde

**Uppgifter:**
- [ ] Lägg till "ML-förutsägelse"-knapp i TestLab
  - Visar ML-korrigerad position som förslag
  - Användaren kan acceptera/avvisa med ett klick
- [ ] Lägg till "Jämför med ML"-läge
  - Visar både manuell och ML-korrigerad position samtidigt
  - Färgkodning: grön = manuell, blå = ML
- [ ] Lägg till "Batch-acceptera ML"-funktion
  - Acceptera alla ML-förutsägelser som är "bra nog" (t.ex. < 1m fel)
  - Spara tid vid masskorrigering

**Fördelar:**
- Snabbare korrigeringsprocess
- Mindre manuellt arbete
- Bättre integration mellan TestLab och ML

**Tidsåtgång:** 3-4 dagar

---

#### 1.2 ML Dashboard: Förbättrad feedback
**Mål:** Göra feedback-processen mer effektiv och informativ

**Uppgifter:**
- [ ] Lägg till "Batch-feedback"-läge
  - Markera flera positioner samtidigt
  - Ge feedback på alla markerade positioner
- [ ] Lägg till "Smart feedback"-förslag
  - Automatiskt föreslå "Korrekt" för positioner där ML-förutsägelsen är nära faktisk korrigering (< 0.5m skillnad)
  - Användaren behöver bara bekräfta
- [ ] Lägg till feedback-statistik
  - Visa hur många positioner som har feedback
  - Visa fördelning: korrekt/inkorrekt/pending
  - Visa förbättringar över tid

**Fördelar:**
- Snabbare feedback-process
- Mindre manuellt arbete
- Bättre översikt över feedback-status

**Tidsåtgång:** 2-3 dagar

---

#### 1.3 ML-modell: Automatisk reträning
**Mål:** Modellen tränas om automatiskt när tillräckligt med feedback finns

**Uppgifter:**
- [ ] Lägg till endpoint: `POST /api/ml/retrain`
  - Kontrollerar om tillräckligt med ny feedback finns (t.ex. 50+ nya feedback-poster)
  - Kör `analysis.py` automatiskt
  - Jämför ny modell med gammal modell
  - Spara ny modell om den är bättre
- [ ] Lägg till "Reträning"-knapp i ML Dashboard
  - Manuell reträning när användaren vill
  - Visar förbättringar (MAE, R² Score)
- [ ] Lägg till automatisk reträning-schema (valfritt)
  - Kör reträning varje natt om tillräckligt med feedback finns

**Fördelar:**
- Modellen förbättras kontinuerligt
- Mindre manuellt arbete
- Snabbare feedback-loop

**Tidsåtgång:** 2-3 dagar

---

### FASE 2: Avancerade funktioner (2-3 veckor) 🔥 MEDEL PRIORITET

#### 2.1 TestLab: Kvalitetsindikatorer
**Mål:** Visa kvalitet på korrigeringar och GPS-data visuellt

**Uppgifter:**
- [ ] Lägg till "Kvalitetsindikator" per position
  - Färgkodning baserat på GPS accuracy: grön (< 10m), gul (10-20m), röd (> 20m)
  - Färgkodning baserat på korrigeringsstorlek: grön (< 1m), gul (1-3m), röd (> 3m)
- [ ] Lägg till "Kvalitetsöversikt" för hela spåret
  - Visa genomsnittlig accuracy
  - Visa genomsnittlig korrigeringsstorlek
  - Visa problemområden (stora korrigeringar)
- [ ] Lägg till "ML-kvalitetsjämförelse"
  - Jämför manuell korrigering med ML-förutsägelse
  - Visa skillnad i meter
  - Färgkodning: grön = bra matchning, röd = stor skillnad

**Fördelar:**
- Bättre översikt över data-kvalitet
- Identifiera problemområden snabbare
- Bättre beslutsunderlag

**Tidsåtgång:** 3-4 dagar

---

#### 2.2 ML-modell: Modellversionering
**Mål:** Spåra olika modellversioner och jämföra prestanda

**Uppgifter:**
- [ ] Lägg till modellversionering i `ml/output/`
  - Spara varje modell med timestamp och git commit
  - Spara modellinfo (MAE, R², antal positioner, etc.)
- [ ] Lägg till "Modellhistorik"-vy i ML Dashboard
  - Visa alla modellversioner
  - Jämför prestanda mellan versioner
  - Möjlighet att återställa till äldre version
- [ ] Lägg till "A/B-testing"-funktion
  - Testa två modellversioner på samma spår
  - Jämför resultat
  - Välj bästa modellen

**Fördelar:**
- Bättre spårning av modellförbättringar
- Möjlighet att återställa vid regression
- Vetenskaplig jämförelse av modeller

**Tidsåtgång:** 4-5 dagar

---

#### 2.3 ML-modell: Active Learning
**Mål:** Modellen föreslår vilka positioner som behöver mest feedback

**Uppgifter:**
- [ ] Implementera "Uncertainty Sampling"
  - Identifiera positioner där modellen är osäker (hög varians i förutsägelse)
  - Föreslå dessa för feedback
- [ ] Lägg till "Active Learning"-vy i ML Dashboard
  - Visa positioner som behöver feedback mest
  - Sortera efter osäkerhet
  - Fokusera feedback på dessa positioner
- [ ] Lägg till "Diversity Sampling"
  - Välj positioner som är olika från redan feedbackade
  - Öka modellens generalisering

**Fördelar:**
- Mer effektiv feedback-process
- Bättre modell med mindre data
- Fokus på viktiga positioner

**Tidsåtgång:** 5-6 dagar

---

### FASE 3: Avancerad feature engineering (2-3 veckor) 🚀 LÅG PRIORITET

#### 3.1 Ytterligare GPS-features
**Mål:** Förbättra modellen med mer GPS-data

**Uppgifter:**
- [ ] Lägg till satellitdata (om tillgängligt)
  - Antal satelliter
  - Signal strength per satellit
  - HDOP/VDOP (Horizontal/Vertical Dilution of Precision)
- [ ] Lägg till terräng-features
  - Höjd över havet (elevation)
  - Terrängtyp (från kartdata: skog, stad, öppet fält, etc.)
  - Närmaste väg (avstånd och typ)
- [ ] Lägg till väderdata (om tillgängligt)
  - Molnighet
  - Vindhastighet
  - Sikt

**Fördelar:**
- Bättre modell-prestanda
- Bättre förståelse för GPS-fel
- Mer robusta förutsägelser

**Tidsåtgång:** 1-2 veckor (beroende på datatillgång)

---

#### 3.2 Tidssekvens-features
**Mål:** Använd tidssekvens-data för bättre förutsägelser

**Uppgifter:**
- [ ] Implementera LSTM-modell (för tidssekvenser)
  - Använd historik av positioner för förutsägelse
  - Bättre för rörelse-mönster
- [ ] Lägg till "Trajectory features"
  - Kurvatur (hur mycket spåret svänger)
  - Acceleration patterns
  - Stopp/start-detektion

**Fördelar:**
- Bättre förutsägelser för rörelse
- Bättre hantering av komplexa mönster
- Mer avancerad modell

**Tidsåtgång:** 1-2 veckor

---

### FASE 4: Användarupplevelse (1-2 veckor) 💡 MEDEL PRIORITET

#### 4.1 TestLab: Förbättrad visualisering
**Mål:** Göra TestLab mer intuitivt och användarvänligt

**Uppgifter:**
- [ ] Lägg till "Heatmap" för korrigeringar
  - Visa områden med stora korrigeringar
  - Identifiera problemområden visuellt
- [ ] Lägg till "Timeline"-vy
  - Visa korrigeringar över tid
  - Identifiera tidsperioder med problem
- [ ] Lägg till "3D-visualisering" (valfritt)
  - Visa spår i 3D med höjd
  - Bättre förståelse för rörelse

**Fördelar:**
- Bättre användarupplevelse
- Snabbare identifiering av problem
- Mer intuitivt arbetsflöde

**Tidsåtgång:** 3-4 dagar

---

#### 4.2 ML Dashboard: Förbättrad analys
**Mål:** Ge bättre insikt i modellens prestanda

**Uppgifter:**
- [ ] Lägg till "Per-spår analys"
  - Visa modellens prestanda per spår
  - Identifiera problemspår
  - Föreslå förbättringar
- [ ] Lägg till "Feature importance"-visualisering
  - Visa vilka features som är viktigast
  - Förklara varför modellen gör vissa förutsägelser
- [ ] Lägg till "Error analysis"
  - Visa positioner med stora fel
  - Analysera mönster i fel
  - Föreslå förbättringar

**Fördelar:**
- Bättre förståelse för modellen
- Identifiera problemområden
- Data-driven förbättringar

**Tidsåtgång:** 3-4 dagar

---

## 📈 Mätvärden för framgång

### TestLab
- **Korrigeringshastighet:** Antal positioner korrigerade per timme
- **Kvalitet:** Genomsnittlig korrigeringsstorlek (lägre är bättre)
- **Användarvänlighet:** Tidsåtgång för att lära sig systemet

### ML-modell
- **MAE (Mean Absolute Error):** < 0.5 meter (mycket bra), < 1.0 meter (bra)
- **R² Score:** > 0.9 (mycket bra), > 0.7 (bra)
- **Feedback-effektivitet:** Antal feedback-poster per förbättring

---

## 🎯 Rekommenderad implementeringsordning

### Vecka 1-2: Grundläggande förbättringar
1. TestLab: ML-integration (1.1)
2. ML Dashboard: Förbättrad feedback (1.2)
3. ML-modell: Automatisk reträning (1.3)

### Vecka 3-4: Användarupplevelse
4. TestLab: Kvalitetsindikatorer (2.1)
5. ML Dashboard: Förbättrad analys (4.2)

### Vecka 5-6: Avancerade funktioner
6. ML-modell: Modellversionering (2.2)
7. ML-modell: Active Learning (2.3)

### Vecka 7+: Avancerad feature engineering
8. Ytterligare GPS-features (3.1)
9. Tidssekvens-features (3.2)

---

## 💡 Ytterligare idéer (framtida)

### TestLab
- **AI-assisterad korrigering:** ML-modellen föreslår korrigeringar automatiskt
- **Kollaborativ korrigering:** Flera användare kan korrigera samma spår
- **Kvalitetskontroll:** Automatisk validering av korrigeringar

### ML-modell
- **Ensemble methods:** Kombinera flera modeller för bättre prestanda
- **Transfer learning:** Använd modeller tränade på andra GPS-data
- **Online learning:** Modellen lär sig kontinuerligt utan reträning

---

## 📝 Noteringar

- **Prioritering:** Fokusera på Fase 1 först - detta ger störst värde för minst arbete
- **Iterativ utveckling:** Implementera en funktion i taget och testa
- **Användarfeedback:** Samla feedback efter varje fase för att justera planen
- **Dokumentation:** Uppdatera dokumentation efter varje förbättring

---

**Senast uppdaterad:** 2025-12-08
**Status:** Planerad
**Nästa steg:** Börja med Fase 1.1 - TestLab: ML-integration

