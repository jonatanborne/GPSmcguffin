# Strategi: träningsdata, “nytt vs gammalt” och modellens egna gissningar

## Problemet

1. **Självförstärkning:** Om modellen tränas om och om igen mest på **sina egna förslag** (som du sedan godkänt) riskerar den att **låsa sig** vid samma fel – utan tydlig markering av *varifrån målet kom*.
2. **Blandad kvalitet:** **Manuellt facit** (TestLab), **experimentbetyg** (helhetsomdöme → många punkter), **ML-feedback “korrekt”** och ev. syntetisk data har **olika trovärdighet** men hamnar ofta i samma hög.
3. **Ingen versionslinje:** Utan fält som *vilken modellversion som genererade förslaget* är det svårt att analysera “gammal modell vs ny modell” eller filtrera bort en dålig generation.

Målet är **strukturerad metadata** + **valfri viktning/filtrering** i träningen – inte magi.

---

## Rekommenderad datamodell (per träningsrad i JSON)

Varje objekt i `ml/data/*.json` bör över tid kunna innehålla:

| Fält | Syfte |
|------|--------|
| `source` / `data_lineage` | Grov källa: `manual_testlab`, `experiment_rated`, `ml_prediction_feedback`, `imported_synthetic`, … |
| `label_type` | Vad etiketten *betyder*: t.ex. `accept_ml_correction`, `reject_ml_correction`, `human_corrected_position` |
| `producer_model_version` | Modell som **skapade det du bedömt** (experiment: `ml_experiments.model_version`) |
| `experiment_id` + `experiment_rating` | Spårbarhet för experiment-export |
| `export_batch_id` | Samma id för alla rader i en exportfil (batch i tid) |
| `training_weight_suggested` | *Förslag* 0–1 tills `analysis.py` använder `sample_weight` (se nedan) |

**Manuell data (TestLab-export)** bör få högsta trovärdighet och ofta `label_type: human_corrected_position` utan `producer_model_version` (eller satt till `null`).

**Experiment med betyg ≥ 7:** målet är modellens korrigerade punkt *som du godkände* → tydlig `producer_model_version` + `label_type: accept_ml_correction`.

**Experiment med betyg ≤ 3:** målet är “stanna vid original” → `label_type: reject_ml_correction` (viktigare för att *inte* upprepa samma flytt).

**ML-feedback “korrekt”** (utan manuell `corrected_position`): målet är modellens förslag → lägre vikt än manuellt facit om du vill undvika ren självinlärning.

---

## Hur modellen kan “lära sig vad som är nytt”

Modellen (random forest m.m.) lär sig **inte explicit** “minne av gammal modell” – den ser bara features → target. Det du *kan* göra är:

1. **Features som indirekt kodar “läge”** (redan delvis): t.ex. accuracy, hastighet, tid – inte samma som modellversion.
2. **Viktning (`sample_weight` i sklearn):**  
   - Manuellt facit: vikt **1.0**  
   - Experiment godkänd ML: **0.6–0.8**  
   - Experiment avvisad ML: **0.5–0.7** (negativ signal är värdefull)  
   - Endast “ML sa rätt” utan manuell punkt: **0.3–0.5**
3. **Filtrering vid reträning:** Träna bara på `producer_model_version != '20240201-...'` för att släppa in en *ny* modellgeneration stegvis (experimentellt).
4. **Tidsbaserad vikt:** `exported_at` eller `export_batch_id` → nyare batch högre vikt (exponential decay).
5. **Grupp-split:** Dela train/test efter **`track_id`** (inte slump per punkt) så du mäter generalisering till *nya spår*.

---

## Bättre struktur på testdata (praktiskt)

1. **Separata filer per källa** (valfritt): `manual_*.json`, `experiment_feedback_*.json` – enklare att väga och debugga än en enda soppa.
2. **En “master”-export** som listar vilka filer som ingick + datum + modellversion som tränades ut.
3. **Mellanbetyg 4–6 i experiment:** Idag används de inte; framtida `label_type: weak_positive/weak_negative` + lägre vikt.
4. **Dokumentera i README:** “Efter varje reträning: spara `gps_correction_model_info.json` och notera vilken `model_version` som körde experimenten som följer.”

---

## Implementation i kodbasen (stegvis)

| Steg | Status / åtgärd |
|------|------------------|
| Metadata på experiment-export | `train_from_experiments.py` lägger till `experiment_id`, `producer_model_version`, `label_type`, `export_batch_id`, m.m. |
| `analysis.py` läser vikt | Läs `training_weight_suggested` om finns → `fit(..., sample_weight=)` |
| TestLab-export | Utöka export-API/script med samma fältnamn |
| ML-feedback till JSON | Pipeline som skriver rader med `data_lineage: ml_prediction_feedback` |

---

## Kort slutsats

- **“Nytt vs gammalt”** i ML-mening = **metadata + viktning + vilka rader du inkluderar**, inte att modellen “minns” gammal modell.
- **Struktur** = konsekventa fält, batch-id, `producer_model_version`, och tydlig `label_type`.
- Nästa naturliga kodsteg: **`sample_weight` i `train_ml_model`** baserat på `training_weight_suggested` (eller tabell över `source` → vikt).

Se även `docs/ML_PRODUCT_GOAL.md` och `ml/FEEDBACK_EXPLANATION.md`.
