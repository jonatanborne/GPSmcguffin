# Mål för ML och spårvisning

## Vision

**Spåren ska visas så tydligt och korrekt som möjligt** utifrån hur **människan eller hunden faktiskt har rört sig** – inte utifrån rå GPS som den är.

Rådata från GPS är nästan alltid **lite fel**: brus, drift, hopplock mellan satelliter, dålig signal under träd/tak osv. Den registrerade polylinjen blir därför ofta **konstig** jämfört med verklig gångväg.

## Vad vi vill att modellen ska göra

Modellen ska **lära sig återskapa en rimlig, “korrekt” bana** utifrån:

1. **Det GPS faktiskt säger** (accuracy, hastighet, positioner i tid, spårtyp, relation mellan hund- och människaspår där det finns).
2. **Den information ni ger om vad som är rätt** – t.ex.:
   - **Manuellt korrigerade spår** (TestLab / exporterad sanning: original → korrigerad punkt).
   - **Experiment**: helhetsbetyg och kommentarer om modellens förslag (stöd för att förstärka bra beteenden och dämpa dåliga).

Det är alltså **inte** magi utan **kvalificerade gissningar**: modellen generaliserar från exempel där ni sagt “så här borde det sett ut” och försöker applicera liknande korrigeringar på nya, stökiga spår – inom de begränsningar som features, data och val av modell sätter.

## Vad “korrekt” betyder i praktiken

- **Målbilden** är den **faktiska rörelsen** (så nära ni kan komma den med manuell granskning och korrigering).
- **Modellens output** är en **uppskattning** av den banan, styrd av träningsdata och av hur servern omvandlar modellens tal (t.ex. korrigeringsstyrka) till nya koordinater.
- Ju **rikare och mer konsekvent** er “sanning” är (manuella korrigeringar + tydliga experiment), desto bättre kan gissningarna bli – men **perfekt varje gång** är inte ett realistiskt krav; kontinuerlig förbättring är det.

## Koppling till resten av systemet

- **Träning:** `ml/analysis.py` / `ml/train_only.py` på annoterad data under `ml/data/` (exporter + ev. `train_from_experiments.py`).
- **Tillämpning:** API som läser `ml/output/*.pkl` och kör korrigering på positioner eller genererar experiment-spår.
- **Experimentläge:** Mänsklig bedömning av *hela* modellförslaget; kompletterar punktnära sanning från TestLab.

---

*Detta dokument förtydligar produkt-/ML-målet; teknisk pipeline beskrivs i `docs/EXPERIMENT_MODE.md`, `ml/HOW_TRAINING_WORKS.md` m.fl.*
