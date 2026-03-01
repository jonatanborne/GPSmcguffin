# Experiment Mode - Snabbguide

## Vad är det?

Ett nytt sätt att träna ML-modellen genom att **bedöma hela spår** istället för att korrigera punkt för punkt.

## Hur fungerar det?

1. **Modellen korrigerar alla kundspår** automatiskt
2. **Du ger betyg 1-10** för varje korrigerat spår
3. **Modellen lär sig** vad du tycker är bra korrigeringar

## Steg-för-steg

### 1. Kör migrering (en gång)

```bash
export DATABASE_URL="postgresql://user:password@host:port/database"
python backend/scripts/migrate_ml_experiments.py
```

### 2. Öppna appen

- Gå till Railway-appen
- Klicka på fliken **"Experiment"** (ny flik längst till höger)

### 3. Generera experiment

- Klicka **"Generera experiment"**
- Vänta medan modellen korrigerar alla 100 kundspår
- Detta tar ~1-2 minuter

### 4. Bedöm spår

För varje spår:
- Se **grått streckad linje** = original kundspår
- Se **röd solid linje** = modellens korrigering
- Ge betyg 1-10:
  - **1-3**: Dålig korrigering
  - **4-7**: OK men inte perfekt
  - **8-10**: Bra korrigering
- Klicka **"Spara & Nästa"**

**Tips:** Bedöm 50-100 spår för bäst resultat (tar ~30 min)

### 5. Konvertera till träningsdata

```bash
export DATABASE_URL="postgresql://user:password@host:port/database"
python ml/train_from_experiments.py
```

Detta skapar en ny JSON-fil i `ml/data/` med träningsdata från dina betyg.

### 6. Träna om modellen

```bash
python ml/analysis.py
```

Modellen tränas nu på:
- Dina manuella korrigeringar från TestLab
- Dina experiment-betyg från Experiment Mode

### 7. Testa nya modellen

- Gå till **ML Dashboard**
- Välj ett kundspår
- Se om korrigeringen blivit bättre!

## Vad bedömer jag?

**Ge höga betyg när:**
- Spåret ser jämnt och naturligt ut
- Följer logiska vägar/stigar
- Realistisk rörelse för en hund
- Inga konstiga hopp

**Ge låga betyg när:**
- För mycket korrigering (flyttas för långt)
- Konstiga mönster (sicksack)
- Spåret ser onaturligt ut

## Fördelar vs TestLab

**TestLab (befintligt):**
- ✅ Exakt träningsdata
- ❌ Tidskrävande (korrigera varje punkt)
- Bäst för: Få spår med hög precision

**Experiment Mode (nytt):**
- ✅ Snabb feedback (bedöm hela spår)
- ✅ Lär modellen dina preferenser
- ❌ Mindre exakt
- Bäst för: Många spår, lära modellen vad som "ser bra ut"

**Rekommendation:** Använd båda! TestLab för precision, Experiment Mode för volym.
