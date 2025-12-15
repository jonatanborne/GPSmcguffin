# Komplett Modell: GPS-korrigering + Smoothing + Matchning

## 🎯 Målet

**En enda ML-modell som gör ALLT:**
1. ✅ **Korrigerar GPS-fel** (ta bort GPS-fel)
2. ✅ **Gör spåren jämna** (smoothing, ta bort "hopp")
3. ✅ **Matchar hundspår med människaspår** (när de gick tillsammans → hundspår ska ligga nära/på människaspår)

**Allt i ett steg!** Modellen ska lära sig att göra alla tre sakerna samtidigt.

---

## 📊 Nuvarande Modell vs. Förbättrad Modell

### Nuvarande Modell
```
Input: GPS accuracy, position, hastighet, etc.
Output: Korrigeringsavstånd (meter)

Vad den gör:
- Korrigerar GPS-fel individuellt
- Ser INTE människaspår
- Gör INTE spåren jämna
```

### Förbättrad Modell (Vad Vi Vill Ha)
```
Input: 
- GPS accuracy, position, hastighet, etc.
- Spår-jämnhet (kurvatur, hastighetsvariation)
- Avstånd till människaspår (för hundspår)
- Människaspår-hastighet vid samma tid

Output: Korrigerad position som:
- Korrigerar GPS-fel
- Gör spåret jämnt
- Ligger nära/på människaspår (när de gick tillsammans)

Vad den gör:
- Korrigerar GPS-fel
- Gör spåren jämna (smoothing)
- Matchar hundspår med människaspår
```

---

## 🔧 Implementation: Nya Features

### Feature Kategori 1: Spår-Jämnhet (Smoothing)

För varje position, beräkna:

```python
# Kurvatur (hur mycket spåret svänger)
def calculate_curvature(prev_pos, curr_pos, next_pos):
    if prev_pos and next_pos:
        # Beräkna vinkeln mellan tre positioner
        angle = calculate_angle(prev_pos, curr_pos, next_pos)
        # Högre vinkel = mer kurvatur = mindre jämnt
        return angle
    return 0.0

# Hastighetsvariation (hur jämnt rör sig spåret)
def calculate_speed_consistency(positions, window=5):
    speeds = [calculate_speed(p1, p2) for p1, p2 in zip(positions, positions[1:])]
    if len(speeds) >= window:
        recent_speeds = speeds[-window:]
        return np.std(recent_speeds)  # Låg std = jämnt, hög std = ojämnt
    return 0.0

# Position-jump (är det ett "hopp"?)
def calculate_position_jump(curr_pos, expected_pos):
    if expected_pos:
        return haversine_distance(curr_pos, expected_pos)
    return 0.0
```

**Nya features:**
- `track_curvature`: Kurvatur (grader eller radianer)
- `speed_consistency`: Standardavvikelse för hastighet (m/s)
- `position_jump_size`: Avstånd från förväntad position (meter)

### Feature Kategori 2: Närhetsmatchning (Proximity Matching)

För hundspår-positioner, beräkna:

```python
# Hitta närmaste människaspår-position (baserat på timestamp eller avstånd)
def find_nearest_human_position(dog_pos, dog_timestamp, human_track):
    # Alternativ 1: Hitta närmaste baserat på timestamp
    nearest_by_time = find_human_pos_at_timestamp(dog_timestamp, human_track)
    
    # Alternativ 2: Hitta närmaste baserat på avstånd
    nearest_by_distance = find_closest_human_pos(dog_pos, human_track)
    
    # Använd den närmaste
    return min(nearest_by_time, nearest_by_distance, key=lambda p: distance(dog_pos, p))

# Beräkna features
nearest_human = find_nearest_human_position(dog_pos, dog_timestamp, human_track)
distance_to_human = haversine_distance(dog_pos, nearest_human)
direction_to_human = calculate_bearing(dog_pos, nearest_human)
human_speed = get_human_speed_at_position(nearest_human)
```

**Nya features (endast för hundspår):**
- `distance_to_human_track`: Avstånd till människaspår (meter)
- `direction_to_human`: Riktning mot människaspår (grader)
- `human_track_speed`: Hastighet på människaspår (m/s)
- `human_track_exists`: Finns människaspår? (1 eller 0)

**För människaspår:**
- `distance_to_human_track`: 0.0 (eller NaN)
- `direction_to_human`: 0.0
- `human_track_speed`: 0.0
- `human_track_exists`: 0

---

## 🎓 Hur Modellen Lär Sig

### Exempel: Du Justerar Ett Hundspår

**Original GPS (hoppigt, långt från människaspår):**
```
Position #10: 59.3665, 17.9918 (GPS-fel, hoppigt, 8m från människaspår)
Position #11: 59.3668, 17.9921 (GPS-fel, hoppigt, 9m från människaspår)
Position #12: 59.3662, 17.9915 (GPS-fel, hoppigt, 7m från människaspår)
```

**Människaspår (korrekt):**
```
Position #10: 59.3660, 17.9911
Position #11: 59.3662, 17.9913
Position #12: 59.3664, 17.9915
```

**Din justering (jämnt, nära människaspår):**
```
Position #10: 59.3661, 17.9912 (jämnt, 1m från människaspår)
Position #11: 59.3663, 17.9914 (jämnt, 1m från människaspår)
Position #12: 59.3665, 17.9916 (jämnt, 1m från människaspår)
```

**Vad modellen ser (med nya features):**

**Input features för Position #10:**
```
GPS accuracy: 15m
Distance to human: 8m (för långt bort!)
Track curvature: 0.3 (hög, hoppigt)
Speed consistency: 0.8 (låg, ojämnt)
Human track speed: 1.2 m/s
```

**Target (output):**
```
Korrigerad position: 59.3661, 17.9912
- Korrigerar GPS-fel (15m accuracy → ~5m korrigering)
- Minskar distance_to_human (8m → 1m)
- Minskar curvature (0.3 → ~0.1, jämnare)
- Ökar speed_consistency (0.8 → ~0.3, jämnare)
```

**Vad modellen lär sig:**
- "När GPS accuracy = 15m, distance_to_human = 8m, curvature = 0.3 → korrigera till position som har distance_to_human ≈ 1m, curvature ≈ 0.1"
- "När hund och människa gick tillsammans → korrigera så att hundspår ligger nära/på människaspår"
- "När spåret är hoppigt → korrigera för att göra det jämnt"

---

## 🔄 Dataförberedelse

### Export-funktionen Måste Inkludera:

När du exporterar hundspår för ML-träning, måste exporten inkludera:

```json
{
  "track_id": 54,
  "track_name": "Johnny Depps hund",
  "track_type": "dog",
  "human_track_id": 53,  // ← NYTT: Länk till människaspår
  "human_track_name": "Johnny Depp",  // ← NYTT
  "positions": [
    {
      "id": 1234,
      "timestamp": "2025-12-01T08:13:43",
      "original_position": {"lat": 59.3665, "lng": 17.9918},
      "corrected_position": {"lat": 59.3661, "lng": 17.9912},
      "accuracy": 15.0,
      // NYTT: Människaspår-data vid samma tidpunkt
      "human_track_position": {  // ← NYTT
        "lat": 59.3660,
        "lng": 17.9911,
        "timestamp": "2025-12-01T08:13:43",
        "speed": 1.2
      }
    }
  ]
}
```

### Eller: Beräkna Features Vid Träning

Alternativt kan vi beräkna features direkt i `prepare_features_advanced()`:

```python
# Hämta människaspår för detta hundspår
human_track_id = d.get("human_track_id")
if human_track_id and track_type == "dog":
    # Hitta människaspår i data
    human_track_data = find_human_track_in_data(data, human_track_id)
    
    # Hitta närmaste människaspår-position
    nearest_human = find_nearest_human_position(
        curr_pos, timestamp, human_track_data
    )
    
    # Beräkna features
    distance_to_human = haversine_distance(curr_pos, nearest_human)
    # ... etc
```

---

## 📝 Implementation Checklist

### Steg 1: Uppdatera Export-funktionen
- [ ] Lägg till `human_track_id` i export för hundspår
- [ ] Inkludera människaspår-positioner i export (eller länk till dem)
- [ ] Se till att timestamps matchar

### Steg 2: Lägg Till Features i `prepare_features_advanced()`
- [ ] Beräkna `track_curvature` för varje position
- [ ] Beräkna `speed_consistency` för varje position
- [ ] Beräkna `position_jump_size` för varje position
- [ ] För hundspår: Hitta människaspår och beräkna `distance_to_human_track`
- [ ] För hundspår: Beräkna `direction_to_human` och `human_track_speed`

### Steg 3: Uppdatera Target
- [ ] Target förblir `correction_distance_meters` (eller korrigerad position)
- [ ] Men modellen lär sig att korrigera så att:
  - GPS-fel korrigeras
  - Spåret blir jämnt (låg kurvatur, jämn hastighet)
  - Hundspår ligger nära människaspår (när de gick tillsammans)

### Steg 4: Testa och Träna
- [ ] Exportera spår med både hund och människa
- [ ] Träna modellen med nya features
- [ ] Testa på nya spår och verifiera att:
  - GPS-fel korrigeras
  - Spåren blir jämna
  - Hundspår matchar människaspår (när de gick tillsammans)

---

## ✅ Sammanfattning

**Mål:**
En enda ML-modell som gör ALLT:
1. ✅ Korrigerar GPS-fel
2. ✅ Gör spåren jämna (smoothing)
3. ✅ Matchar hundspår med människaspår (när de gick tillsammans)

**Implementation:**
- Lägg till features för spår-jämnhet (kurvatur, hastighetsvariation, position-jump)
- Lägg till features för närhetsmatchning (avstånd till människaspår, riktning, hastighet)
- Modellen lär sig att göra alla tre sakerna samtidigt

**Resultat:**
- Snygga, jämna spår
- Hundspår matchar människaspår när de gick tillsammans
- Allt i ett steg!

