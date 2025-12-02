# ML-modell för GPS-korrigering: Komplett Guide

## Innehållsförteckning
1. [Översikt](#översikt)
2. [Hur ML-modellen lär sig](#hur-ml-modellen-lär-sig)
3. [Dataförberedelse](#dataförberedelse)
4. [Feature Engineering](#feature-engineering)
5. [Modellträning](#modellträning)
6. [Utvärdering](#utvärdering)
7. [Förbättringar](#förbättringar)

---

## Översikt

### Vad gör modellen?
ML-modellen försöker **förutsäga hur mycket en GPS-position behöver korrigeras** (i meter) baserat på:
- GPS-egenskaper (accuracy, position)
- Kontext (track type, tid)
- Rörelse (hastighet, acceleration, riktning)
- Historik (tidigare korrigeringar)

### Target Variable
**`correction_distance_meters`** - Avståndet mellan originalpositionen och den korrigerade positionen
- `0 meter` = Positionen var korrekt från början
- `> 0 meter` = Positionen var felaktig och behövde korrigeras

### Varför både korrekta och felaktiga positioner?
Modellen behöver se **båda typerna** för att lära sig:
- **Korrekt position** → "Detta är bra, ingen korrigering behövs"
- **Felaktig position** → "Detta är dåligt, korrigering behövs"

Utan korrekta positioner skulle modellen bara se felaktiga och inte förstå vad som är "bra".

---

## Hur ML-modellen lär sig

### 1. Supervised Learning
Modellen använder **supervised learning** - den ser exempel med rätt svar:
```
Input: [GPS accuracy: 5m, Speed: 2 m/s, ...]
Output: correction_distance = 0m  ← "Detta är rätt!"
```

### 2. Mönsterigenkänning
Modellen hittar mönster i datan:
- "När GPS accuracy är låg (< 10m) och speed är låg (< 3 m/s) → correction_distance ≈ 0"
- "När GPS accuracy är hög (> 20m) och speed är hög (> 5 m/s) → correction_distance > 5m"

### 3. Generalisering
Efter träning kan modellen **generalisera** till nya positioner den inte sett tidigare:
```
Ny position: [GPS accuracy: 15m, Speed: 4 m/s, ...]
Modellen förutsäger: "Denna position behöver troligen korrigeras ~3 meter"
```

---

## Dataförberedelse

### Steg 1: Exportera data
1. Gå till TestLab i appen
2. Välj spår att exportera
3. Klicka "Exportera för ML"
4. Spara JSON-filen i `ml/data/`

### Steg 2: Dataformat
Varje position i JSON-filen innehåller:
```json
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
```

### Steg 3: Datafiltrering
Modellen filtrerar bort:
- Positioner utan `corrected_position`
- Outliers (top 1% med störst korrigeringar)

---

## Feature Engineering

### Vad är features?
**Features** är de indata som modellen använder för att förutsäga `correction_distance`. Vi har **22 features**:

### 1. GPS-egenskaper (2 features)
- **`gps_accuracy`**: Rapporterad GPS-noggrannhet från enheten (meter)
- **`gps_accuracy_squared`**: Accuracy² (för icke-linjära samband)

**Varför?** GPS accuracy är ofta korrelerad med faktiskt fel, men sambandet är icke-linjärt.

### 2. Position (4 features)
- **`latitude`**: Breddgrad (59.36...)
- **`longitude`**: Längdgrad (17.99...)
- **`lat_normalized`**: Breddgrad relativt spårets medelvärde
- **`lng_normalized`**: Längdgrad relativt spårets medelvärde

**Varför?** 
- Absolut position kan påverka GPS-kvalitet (t.ex. i städer vs. skog)
- Normaliserad position hjälper modellen fokusera på relativa förändringar

### 3. Kontext (5 features)
- **`track_type_human`**: 1 om människa, 0 om hund
- **`hour_sin/cos`**: Timme på dygnet (cyklisk encoding)
- **`weekday_sin/cos`**: Veckodag (cyklisk encoding)

**Varför?**
- Människor och hundar rör sig olika
- GPS-kvalitet kan variera med tid på dygnet (t.ex. satellitpositioner)

### 4. Rörelse (6 features)
- **`speed_ms`**: Hastighet i m/s (baserat på tidigare positioner)
- **`acceleration_ms2`**: Acceleration i m/s²
- **`distance_prev_1/2/3`**: Avstånd till 1, 2, 3 tidigare positioner
- **`bearing_degrees`**: Riktning i grader (0-360°)

**Varför?**
- Högre hastighet → större GPS-fel (doppler-effekt)
- Acceleration indikerar hastiga rörelseförändringar
- Avstånd till tidigare positioner hjälper modellen förstå rörelsemönster
- Riktning kan påverka GPS-kvalitet (t.ex. i skugga av byggnader)

### 5. Historik (2 features)
- **`rolling_mean_correction`**: Medelvärde av senaste 3 korrigeringar
- **`rolling_std_correction`**: Standardavvikelse för senaste 3 korrigeringar

**Varför?** Om tidigare positioner i spåret hade stora fel, är nästa position troligen också felaktig.

### 6. Interaktioner (3 features)
- **`accuracy_x_speed`**: GPS accuracy × hastighet
- **`accuracy_x_distance`**: GPS accuracy × avstånd
- **`speed_x_distance`**: Hastighet × avstånd

**Varför?** Kombinationer av features kan ha större effekt än enskilda features (t.ex. dålig accuracy + hög hastighet = mycket större fel).

---

## Modellträning

### Steg 1: Feature Preparation
```python
X, y, feature_names = prepare_features_advanced(data)
# X: [n_samples, 22 features]
# y: [n_samples] - correction_distance_meters
```

### Steg 2: Data Split
- **80% Train**: Modellen lär sig på dessa
- **20% Test**: Modellen testas på dessa (den har inte sett dem tidigare)

### Steg 3: Feature Scaling
Använder **RobustScaler** (bättre för outliers än StandardScaler):
- Centrerar data kring medianen
- Skalar med IQR (Interquartile Range)

### Steg 4: Modellval
Testar **4 olika modeller**:
1. **Random Forest**: Många träd som röstar
2. **Gradient Boosting**: Träd som lär sig från tidigare fel
3. **Extra Trees**: Liknande Random Forest men mer random
4. **XGBoost**: Avancerad gradient boosting

### Steg 5: Hyperparameter Tuning
För varje modell:
- Testar olika kombinationer av hyperparameters
- Använder **RandomizedSearchCV** med 5-fold cross-validation
- Väljer kombinationen med lägst MAE (Mean Absolute Error)

### Steg 6: Modellval
Väljer modellen med **lägst test MAE** (bäst på nya data den inte sett tidigare).

---

## Utvärdering

### Metrics

#### 1. MAE (Mean Absolute Error)
**Genomsnittligt fel i meter**
```
MAE = mean(|predicted - actual|)
```
Exempel: MAE = 0.19m betyder att modellen i genomsnitt har 19cm fel.

#### 2. RMSE (Root Mean Squared Error)
**Större fel väger tyngre**
```
RMSE = sqrt(mean((predicted - actual)²))
```
Exempel: RMSE = 0.38m betyder att större fel är straffade hårdare.

#### 3. R² Score (Coefficient of Determination)
**Hur mycket av variationen modellen förklarar**
- `R² = 1.0`: Perfekt förutsägelse
- `R² = 0.92`: Modellen förklarar 92% av variationen
- `R² = 0.0`: Modellen är lika bra som att gissa medelvärdet

### Visualiseringar

#### 1. True vs Predicted
Scatter plot som visar:
- X-axel: Faktiskt GPS-fel
- Y-axel: Förutsagt GPS-fel
- Röd linje: Perfekt förutsägelse (y = x)

**Tolkning:**
- Punkter nära röd linje = bra förutsägelse
- Punkter långt från linje = dålig förutsägelse

#### 2. Residual Plot
Visar fördelningen av fel:
- X-axel: Förutsagt GPS-fel
- Y-axel: Residual (Faktiskt - Förutsagt)
- Röd linje: y = 0 (ingen fel)

**Tolkning:**
- Punkter nära y=0 = bra förutsägelse
- Systematiska mönster = modellen missar något

---

## Förbättringar

### 1. Fler data
**Mer data = bättre modell**
- Samla fler annoterade positioner
- Olika miljöer (stad, skog, öppet landskap)
- Olika väderförhållanden
- Olika tider på dygnet

### 2. Bättre features
**Nya features att testa:**
- **Satellitantal**: Fler satelliter = bättre GPS
- **HDOP/VDOP**: Horizontal/Vertical Dilution of Precision
- **Elevation**: Höjd över havet
- **Terrain**: Typ av terräng (från kartdata)
- **Weather**: Väderdata (om tillgängligt)

### 3. Feature Selection
**Ta bort oanvända features:**
- Analysera feature importance
- Ta bort features med låg importance (< 0.01)
- Testa om modellen blir bättre utan dem

### 4. Hyperparameter Optimization
**Förbättra hyperparameter tuning:**
- Öka antal iterationer i RandomizedSearchCV
- Använd Optuna eller Hyperopt för avancerad optimization
- Testa fler hyperparameter-kombinationer

### 5. Ensemble Methods
**Kombinera flera modeller:**
- Träna flera modeller
- Ta medelvärdet av deras förutsägelser
- Ofta bättre än en enskild modell

### 6. Deep Learning
**För mycket data (> 100k positioner):**
- Neurala nätverk kan lära sig komplexa mönster
- LSTM för tidssekvenser
- CNN för spatial patterns

### 7. Domain-Specific Features
**GPS-specifika features:**
- **Multipath detection**: GPS-signaler som reflekteras
- **Signal strength**: Styrka på GPS-signaler
- **Satellite geometry**: Vinklar mellan satelliter

---

## Analysverktyg

Se `ml/analyze_model.py` för verktyg att:
- Analysera modellens prestanda per track
- Identifiera positioner med stora fel
- Visualisera feature importance
- Analysera residuals
- Jämföra olika modeller

---

## Vanliga problem och lösningar

### Problem: Modellen har hög MAE
**Lösningar:**
- Fler data
- Bättre features
- Hyperparameter tuning
- Testa andra modeller

### Problem: Modellen överanpassar (overfitting)
**Symptom:** Bra på train, dålig på test
**Lösningar:**
- Mer regularization
- Färre features
- Fler data
- Cross-validation

### Problem: Modellen underanpassar (underfitting)
**Symptom:** Dålig på både train och test
**Lösningar:**
- Fler features
- Mer komplex modell
- Mindre regularization
- Fler data

### Problem: Modellen förutsäger alltid samma värde
**Symptom:** R² ≈ 0
**Lösningar:**
- Kolla om features är korrekta
- Kolla om target variable är korrekt
- Testa enklare modell först

---

## Nästa steg

1. **Samla mer data**: Ju mer data, desto bättre modell
2. **Analysera fel**: Identifiera positioner där modellen har stora fel
3. **Förbättra features**: Lägg till nya features baserat på analys
4. **Iterera**: Träna om modellen med förbättringar
5. **Testa i produktion**: Använd modellen på riktiga spår

---

## Resurser

- **Scikit-learn dokumentation**: https://scikit-learn.org/
- **XGBoost dokumentation**: https://xgboost.readthedocs.io/
- **Feature Engineering**: https://www.kaggle.com/learn/feature-engineering
- **Model Evaluation**: https://scikit-learn.org/stable/modules/model_evaluation.html

