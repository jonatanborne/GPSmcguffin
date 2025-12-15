# Smoothing och Matchning: Vad Modellen Behöver Lära Sig

## 🎯 Dina Krav

### 1. Jämning (Smoothing)
- Spåren ska vara **jämna och snygga**
- Ta bort "hopp" och ojämnheter
- Gör spåren kontinuerliga och naturliga

### 2. Närhetsmatchning (Proximity Matching)
- Om hund och människa gick **samma väg** → hundspår ska ligga **nära** människaspår
- Men **INTE exakt över** (hunden gick kanske lite bredvid)
- Typiskt: 1-3 meter bredvid människaspåret

---

## ❌ Vad Modellen INTE Gör Just Nu

### Problem 1: Ingen Smoothing
Modellen korrigerar varje position individuellt:
```
Position #10: Korrigera 3m → 59.3661, 17.9912
Position #11: Korrigera 5m → 59.3663, 17.9915
Position #12: Korrigera 2m → 59.3660, 17.9910
```

**Resultat**: Spåret kan bli "hoppigt" även om varje korrigering är korrekt individuellt.

### Problem 2: Ingen Proximity Matching
Modellen ser inte människaspåret när den korrigerar hundspår:
```
Hundspår position #10: Korrigera 3m
→ Modellen korrigerar baserat på GPS-fel
→ Men ser INTE att människaspår är 2 meter bort
→ Resultat: Hundspår kan hamna långt från människaspår även om de gick tillsammans
```

---

## ✅ Lösning: Lägg Till Features för Smoothing och Matchning

### Feature 1: Spår-Jämnhet (Track Smoothness)

#### Beräkna för varje position:
```python
# Kurvatur (hur mycket spåret svänger)
curvature = calculate_curvature(prev_pos, curr_pos, next_pos)

# Hastighetsvariation (hur jämnt rör sig spåret)
speed_variation = std_dev(speeds_in_neighborhood)

# Position-jump (är det ett "hopp"?)
position_jump = distance(curr_pos, expected_position_based_on_speed)
```

#### Lägg till som features:
- `track_curvature`: Hur mycket spåret svänger
- `speed_consistency`: Hur jämnt hastigheten är
- `position_jump_size`: Storlek på "hopp" från förväntad position

### Feature 2: Närhetsmatchning (Proximity to Human Track)

#### För hundspår-positioner, beräkna:
```python
# Avstånd till närmaste människaspår-position
distance_to_human = min_distance_to_human_track(curr_pos, human_track)

# Riktning mot människaspår
direction_to_human = bearing(curr_pos, nearest_human_pos)

# Hastighet på människaspår vid samma tidpunkt
human_speed_at_time = get_human_speed_at_timestamp(timestamp)
```

#### Lägg till som features:
- `distance_to_human_track`: Avstånd till människaspår (meter)
- `direction_to_human`: Riktning mot människaspår (grader)
- `human_track_speed`: Hastighet på människaspår vid samma tid
- `human_track_exists`: Finns människaspår? (1 eller 0)

---

## 🎓 Hur Modellen Lär Sig

### Scenario: Hund och Människa Gick Tillsammans

**Input features:**
```
GPS accuracy: 15m
Distance to human track: 2.5m  ← NY FEATURE!
Human track speed: 1.2 m/s     ← NY FEATURE!
Track curvature: 0.05          ← NY FEATURE!
Speed consistency: 0.3         ← NY FEATURE!
```

**Output (target):**
```
Korrigera till position som:
- Korrigerar GPS-fel (15m accuracy → korrigera ~5m)
- Ligger nära människaspår (2.5m → korrigera till ~1-2m från människaspår)
- Gör spåret jämnt (låg kurvatur, jämn hastighet)
```

**Vad modellen lär sig:**
- "När distance_to_human_track = 2.5m → korrigera så att avståndet blir ~1-2m"
- "När track_curvature är hög → korrigera för att göra spåret jämnare"
- "När speed_consistency är låg → korrigera för att jämna ut hastigheten"

---

## 🔧 Implementation

### Steg 1: Lägg Till Features i `prepare_features_advanced()`

```python
# För varje position i hundspår:
if track_type == "dog" and human_track_available:
    # Beräkna avstånd till människaspår
    nearest_human_pos = find_nearest_human_position(
        curr_pos, human_track, timestamp
    )
    distance_to_human = haversine_distance(curr_pos, nearest_human_pos)
    
    # Beräkna riktning mot människaspår
    direction_to_human = calculate_bearing(curr_pos, nearest_human_pos)
    
    # Hämta hastighet på människaspår vid samma tid
    human_speed = get_human_speed_at_timestamp(timestamp)
    
    # Lägg till features
    features.append(distance_to_human)
    features.append(direction_to_human)
    features.append(human_speed)
else:
    # Ingen människaspår tillgänglig
    features.extend([999.0, 0.0, 0.0])  # Default values

# För alla spår (både hund och människa):
# Beräkna spår-jämnhet
curvature = calculate_curvature(prev_pos, curr_pos, next_pos)
speed_consistency = calculate_speed_consistency(neighborhood_speeds)
position_jump = calculate_position_jump(curr_pos, expected_pos)

features.append(curvature)
features.append(speed_consistency)
features.append(position_jump)
```

### Steg 2: Uppdatera Target (Korrigerad Position)

Istället för att bara förutsäga `correction_distance_meters`, kan vi:

**Alternativ A: Behåll nuvarande target**
- Modellen förutsäger fortfarande `correction_distance_meters`
- Men med nya features lär sig modellen att korrigera så att:
  - Spåret blir jämnt (låg kurvatur)
  - Hundspår ligger nära människaspår (när de gick tillsammans)

**Alternativ B: Multi-target learning**
- Target 1: `correction_distance_meters` (GPS-korrigering)
- Target 2: `distance_to_human_after_correction` (närhetsmatchning)
- Target 3: `track_smoothness_after_correction` (jämnhet)

**Rekommendation**: Börja med Alternativ A (enklare), uppgradera till B senare om behövs.

---

## 📊 Praktiskt Exempel

### Scenario: Du Justerar Ett Hundspår

**Original GPS:**
```
Position #10: 59.3665, 17.9918 (GPS-fel, hoppigt)
Position #11: 59.3668, 17.9921 (GPS-fel, hoppigt)
Position #12: 59.3662, 17.9915 (GPS-fel, hoppigt)
```

**Människaspår (korrekt):**
```
Position #10: 59.3660, 17.9911
Position #11: 59.3662, 17.9913
Position #12: 59.3664, 17.9915
```

**Din justering:**
```
Position #10: 59.3661, 17.9912 (nära människaspår, jämnt)
Position #11: 59.3663, 17.9914 (nära människaspår, jämnt)
Position #12: 59.3665, 17.9916 (nära människaspår, jämnt)
```

**Vad modellen lär sig (med nya features):**
```
Input:
- GPS accuracy: 15m
- Distance to human: 8m (för långt bort!)
- Track curvature: 0.3 (hög, hoppigt)
- Speed consistency: 0.8 (låg, ojämnt)

Output:
- Korrigera till position som:
  * Korrigerar GPS-fel (15m → ~5m korrigering)
  * Minskar distance_to_human (8m → ~1-2m)
  * Minskar curvature (0.3 → ~0.1)
  * Ökar speed_consistency (0.8 → ~0.3)
```

**Resultat:**
- Modellen korrigerar GPS-fel
- Modellen lägger hundspår nära människaspår (1-2m)
- Modellen gör spåret jämnt och snyggt

---

## 🚀 Nästa Steg

### Steg 1: Lägg Till Features
Modifiera `prepare_features_advanced()` i `ml/analysis.py`:
- Lägg till `distance_to_human_track` (för hundspår)
- Lägg till `track_curvature`
- Lägg till `speed_consistency`
- Lägg till `position_jump_size`

### Steg 2: Uppdatera Export
Se till att export-funktionen inkluderar:
- Människaspår-data när hundspår exporteras
- Timestamps för att matcha positioner

### Steg 3: Testa och Träna
- Exportera spår med både hund och människa
- Träna modellen med nya features
- Testa på nya spår och se om:
  - Spåren blir jämnare
  - Hundspår ligger närmare människaspår (när de gick tillsammans)

---

## ✅ Sammanfattning

**Nuvarande modell:**
- ✅ Korrigerar GPS-fel individuellt
- ❌ Gör INTE spåren jämna
- ❌ Ser INTE människaspår när den korrigerar hundspår

**Förbättrad modell (med nya features):**
- ✅ Korrigerar GPS-fel
- ✅ Gör spåren jämna (låg kurvatur, jämn hastighet)
- ✅ Lägger hundspår nära människaspår (1-2m) när de gick tillsammans
- ✅ Behåller separation när hunden gick annorlunda

**Resultat:**
- Snygga, jämna spår
- Hundspår ligger naturligt nära människaspår (när de gick tillsammans)
- Spåren visar verkligheten på ett snyggt sätt

