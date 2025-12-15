# Guide: Förbättra ML-modellen kontinuerligt

## Översikt

För att ML-modellen ska bli bättre och bättre behöver den:
1. **Feedback** - Du markerar vilka förutsägelser som är korrekta/inkorrekta
2. **Nya data** - Ju mer data, desto bättre modell
3. **Reträning** - Modellen tränas om med all data (inklusive feedback)

## Workflow för kontinuerlig förbättring

### Steg 1: Testa ML-förutsägelser
1. Gå till ML Dashboard
2. Välj ett spår och klicka "Testa förutsägelse"
3. Se resultaten på kartan och i tabellen

### Steg 2: Ge feedback
1. I tabellen med förutsägelser, klicka på knapparna:
   - ✅ **Korrekt** - Om ML-förutsägelsen stämmer bra
   - ❌ **Felaktig** - Om ML-förutsägelsen är fel
2. Feedback sparas automatiskt i databasen

### Steg 3: Exportera feedback-data
1. När du har gett feedback på flera förutsägelser:
   - Gå till TestLab
   - Klicka "Exportera för ML" (inkluderar nu feedback)
2. Eller använd API: `GET /api/ml/export-feedback`

### Steg 4: Träna om modellen
```bash
cd ml
python analysis.py
```

Modellen kommer nu tränas med:
- Alla tidigare korrigerade spår
- Alla ML-förutsägelser du markerat som korrekta/inkorrekta
- Alla nya spår du korrigerat

### Steg 5: Jämför resultat
- Kolla `ml/output/gps_correction_model_info.json` för att se förbättringar
- Jämför MAE (Mean Absolute Error) - lägre är bättre
- Jämför R² Score - högre är bättre (max 1.0)

## Tips för bättre modell

### 1. Ge feedback på olika typer av förutsägelser
- ✅ Korrekta förutsägelser (modellen gjorde rätt)
- ❌ Felaktiga förutsägelser (modellen gjorde fel)
- Båda typerna hjälper modellen lära sig

### 2. Fokusera på problemområden
- Om modellen har stora fel på vissa typer av spår → ge mer feedback på dessa
- Om modellen har stora fel i vissa miljöer → samla mer data från dessa miljöer

### 3. Samla mer data
- Ju mer korrigerad data, desto bättre modell
- Sträva efter minst 1000 positioner för bra prestanda
- Olika miljöer (stad, skog, etc.) hjälper modellen generalisera

### 4. Regelbundet reträning
- Träna om modellen varje gång du har:
  - 50+ nya feedback-poster
  - 100+ nya korrigerade positioner
  - Eller minst en gång per vecka

## Automatiserad förbättring (framtida)

Framtida funktioner:
- **Automatisk reträning**: Modellen tränas om automatiskt när tillräckligt med feedback finns
- **A/B-testing**: Jämför olika modellversioner
- **Active Learning**: Modellen föreslår vilka positioner som behöver mest feedback

## Mätningar

### MAE (Mean Absolute Error)
- **Vad**: Genomsnittligt fel i meter
- **Bra**: < 1.0 meter
- **Mycket bra**: < 0.5 meter

### R² Score
- **Vad**: Hur väl modellen förklarar variationen i data
- **Bra**: > 0.7
- **Mycket bra**: > 0.9

### Per-spår prestanda
- Kolla `ml/output/track_performance.json` för att se vilka spår modellen hanterar bra/dåligt

## Felsökning

### "Modellen blir inte bättre"
- Kontrollera att feedback-data exporteras korrekt
- Se till att du har tillräckligt med data (minst 500 positioner)
- Kolla `analyze_model.py` för att identifiera problem

### "Modellen har stora fel på vissa spår"
- Ge mer feedback på dessa spår
- Samla mer data från liknande miljöer
- Kolla feature importance för att se vad modellen fokuserar på

### "Feedback sparas inte"
- Kontrollera att du klickar på knapparna i UI:et
- Kolla backend-logs för fel
- Verifiera att `verified_status` uppdateras i databasen

