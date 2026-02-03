# ML-feedback – separat från grunddata

**ML Dashboard-feedback (✅/❌, Auto-godkänn) sparas i `ml_prediction_feedback` – inte i `track_positions`.**

## Varför?

- **Grunddata** (`tracks`, `track_positions`) innehåller dina noggrant annoterade spår från TestLab.
- ML-feedback skriver **aldrig över** grunddatan – dina original- och egna annoterade spår är säkra.
- ML-feedback **används** vid export för träning – modellen får lära sig av sina bra förutsägelser (godkända med ✅/Auto-godkänn).

## Tabell: ml_prediction_feedback

| Kolumn              | Beskrivning                   |
| ------------------- | ----------------------------- |
| prediction_filename | Vilken förutsägelsefil        |
| position_id         | Vilken position               |
| verified_status     | correct / incorrect / pending |
| created_at          | Tidsstämpel                   |

Unik nyckel: `(prediction_filename, position_id)`

## Flöde

1. **TestLab** → Du verifierar/korrigerar → sparar i `track_positions` (grunddata).
2. **ML-analys** → Skapar förutsägelsefil med data från grunddatabasen.
3. **ML Dashboard** → Du ger feedback (✅/❌ eller Auto-godkänn) → sparar i `ml_prediction_feedback`.
4. När du laddar en förutsägelse → backend mergar in feedback från `ml_prediction_feedback` för visning.
5. `track_positions` förblir oförändrad.

## Export för träning

`/ml/export-feedback` inkluderar:

1. **Grunddata** från `track_positions` – alltid, oförändrad (dina annoterade spår).
2. **ML-förutsägelser** markerade som "correct" i `ml_prediction_feedback` – läggs till som extra träningsdata när positionen saknar human-korrigering. Modellen lär sig av sina egna bra gissningar.

Grunddatan skrivs aldrig över. ML-feedback är ett **tillägg** som utökar träningsdatamängden.
