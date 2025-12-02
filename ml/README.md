# ML-modell för GPS-korrigering

Detta är ML-modellen för automatisk GPS-korrigering i Dogtracks Geofence Kit.

## Snabbstart

### 1. Installera dependencies
```bash
cd ml
pip install -r requirements.txt
```

### 2. Exportera data från appen
1. Öppna TestLab i appen
2. Välj spår att exportera
3. Klicka "Exportera för ML"
4. Spara JSON-filen i `ml/data/`

### 3. Kör analys och träna modell
```bash
python analysis.py
```

Detta kommer att:
- Analysera alla JSON-filer i `ml/data/`
- Skapa visualiseringar
- Träna ML-modellen
- Spara modellen i `ml/output/`

### 4. Analysera tränad modell
```bash
python analyze_model.py
```

Detta kommer att:
- Analysera modellens prestanda
- Identifiera förbättringsområden
- Skapa detaljerade grafer
- Generera förbättringsförslag

## Filer

### `analysis.py`
Huvudscript för att analysera data och träna modellen.

**Funktioner:**
- `load_annotations()`: Laddar JSON-data
- `basic_statistics()`: Grundläggande statistik
- `analyze_error_patterns()`: Analyserar GPS-felmonster
- `analyze_per_track()`: Analyserar varje spår individuellt
- `prepare_features_advanced()`: Skapar 22 features för ML
- `train_ml_model()`: Tränar och optimerar modellen
- `visualize_data()`: Skapar visualiseringar

### `analyze_model.py`
Avancerad analys av tränad modell.

**Funktioner:**
- `analyze_feature_importance()`: Analyserar vilka features som är viktigast
- `analyze_residuals()`: Analyserar fördelningsfel
- `analyze_per_track_performance()`: Analyserar prestanda per spår
- `analyze_error_cases()`: Identifierar positioner med stora fel
- `generate_improvement_suggestions()`: Genererar förbättringsförslag

### `ML_GUIDE.md`
Komplett guide som förklarar:
- Hur ML-modellen fungerar
- Feature engineering
- Modellträning
- Utvärdering
- Förbättringar

## Mappar

### `data/`
Här lägger du JSON-filer med annoterad GPS-data.

**Format:**
```json
[
  {
    "id": 7787,
    "track_id": 53,
    "track_name": "Johnny Depp",
    "track_type": "human",
    "timestamp": "2025-12-01T08:13:43.272323",
    "verified_status": "correct",
    "original_position": {"lat": 59.3660067, "lng": 17.9911237},
    "corrected_position": {"lat": 59.36601898460498, "lng": 17.991034984588627},
    "correction_distance_meters": 5.21,
    "accuracy": 14.92,
    "annotation_notes": ""
  }
]
```

### `output/`
Här sparas tränade modeller och resultat:
- `gps_correction_model_best.pkl`: Tränad modell
- `gps_correction_scaler.pkl`: Feature scaler
- `gps_correction_feature_names.pkl`: Feature names
- `gps_correction_model_info.json`: Modellinfo (MAE, R², etc.)
- `gps_analysis.png`: Dataanalysgrafer
- `ml_predictions.png`: Förutsägelsegrafer
- `feature_importance_detailed.png`: Feature importance
- `residual_analysis.png`: Residual analys

## Workflow

### 1. Samla data
- Använd TestLab för att justera GPS-positioner
- Exportera justerade spår som JSON
- Lägg JSON-filer i `ml/data/`

### 2. Träna modell
```bash
python analysis.py
```

### 3. Analysera resultat
```bash
python analyze_model.py
```

### 4. Förbättra
- Lägg till mer data
- Förbättra features
- Justera hyperparameters
- Iterera

## Tips

### För bättre modellprestanda:
1. **Mer data**: Ju mer data, desto bättre modell
2. **Olika miljöer**: Samla data från olika miljöer (stad, skog, etc.)
3. **Balanserad data**: Både korrekta och felaktiga positioner
4. **Kvalitet**: Se till att annotationerna är korrekta

### För att förbättra modellen:
1. Kör `analyze_model.py` för att identifiera problem
2. Lägg till nya features baserat på analys
3. Samla mer data för problematiska spår
4. Testa olika modeller och hyperparameters

## Vanliga problem

### "Inga JSON-filer hittades"
- Se till att JSON-filer finns i `ml/data/`
- Kontrollera att filerna har rätt format

### "ModuleNotFoundError"
- Installera dependencies: `pip install -r requirements.txt`

### "Modellen har hög MAE"
- Samla mer data
- Kör `analyze_model.py` för att identifiera problem
- Förbättra features

## Ytterligare resurser

- Se `ML_GUIDE.md` för detaljerad förklaring
- Se `analysis.py` för kodkommentarer
- Se `analyze_model.py` för analysverktyg

