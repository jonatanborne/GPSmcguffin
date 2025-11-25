# Veckoplan - Onsdag till Fredag

## Onsdag - GPS-smoothing & Filtering

### Mål
Förbättra GPS-noggrannheten genom att filtrera bort noise och outliers.

### Uppgifter

#### 1. GPS-smoothing implementation (2-3 timmar)
**Filer att skapa/ändra:**
- `backend/utils/gps_filter.py` (ny fil)
- `backend/main.py` (uppdatera endpoints)

**Funktioner att implementera:**
```python
def smooth_track_positions(positions: List[TrackPosition]) -> List[TrackPosition]:
    """
    Jämna ut GPS-spår med moving average.
    - Använd moving average för att minska noise
    - Behalten första och sista positionen
    - Använd accuracy-data för viktning
    """
    
def filter_speed_outliers(positions: List[TrackPosition], max_speed_kmh: float) -> List[TrackPosition]:
    """
    Filtrera bort positioner som kräver omöjlig hastighet.
    - max_speed_kmh = 50 för människa, 100 för hund
    - Beräkna hastighet mellan positioner
    - Ta bort positioner som kräver > max_speed
    """
    
def filter_accuracy_outliers(positions: List[TrackPosition], max_accuracy_m: float = 50) -> List[TrackPosition]:
    """
    Filtrera bort positioner med dålig accuracy.
    - Ta bort positioner med accuracy > max_accuracy_m
    - Eller vikta dem mindre i beräkningar
    """
```

**API-endpoint att lägga till:**
```python
@app.post("/tracks/{track_id}/smooth")
def smooth_track(track_id: int):
    """
    Applicera smoothing på ett spår.
    Returnera det smoothade spåret.
    """
```

**Testing:**
- Testa med ett spår med mycket noise
- Jämför före/efter
- Verifiera att spåret är jämnare

---

#### 2. Använd smoothing i jämförelse (1-2 timmar)
**Filer att ändra:**
- `backend/main.py` (uppdatera compare-funktioner)

**Ändringar:**
- Applicera smoothing på båda spåren innan jämförelse
- Använd accuracy-data för viktad avståndsberäkning
- Lägg till "raw_distance" och "smoothed_distance" i resultatet

**Resultat:**
- Bättre matchning trots GPS-fel
- Mer exakta avståndsberäkningar

---

#### 3. Frontend: Visa accuracy (1 timme)
**Filer att ändra:**
- `frontend/src/components/GeofenceEditor.jsx`

**Funktioner:**
- Visa GPS-accuracy i realtid när man spårar
- Färgkodning: grön = bra accuracy, röd = dålig
- Varning vid låg accuracy

---

### Leverabler för dagen
- ✅ GPS-smoothing fungerar
- ✅ Speed-filtering fungerar
- ✅ Accuracy-filtering fungerar
- ✅ Jämförelse använder smoothade spår
- ✅ Frontend visar accuracy

### Testning
1. Skapa ett spår med mycket GPS-noise
2. Applicera smoothing
3. Jämför före/efter på kartan
4. Verifiera att jämförelse blir bättre

---

## Torsdag - Intelligent spårjämförelse

### Mål
Implementera intelligent jämförelse som kan matcha spår även med GPS-fel och olika timing.

### Uppgifter

#### 1. Segment-based matching (3-4 timmar)
**Filer att skapa/ändra:**
- `backend/utils/track_comparison.py` (ny fil)
- `backend/main.py` (ny endpoint)

**Funktioner att implementera:**
```python
def split_track_into_segments(positions: List[TrackPosition], angle_threshold: float = 30) -> List[List[TrackPosition]]:
    """
    Dela upp spår i segment baserat på riktningsförändringar.
    - Rät linje = ett segment
    - Sväng = nytt segment
    - angle_threshold = grad för när det räknas som sväng
    """
    
def compare_segments(segment1: List[TrackPosition], segment2: List[TrackPosition]) -> float:
    """
    Jämför två segment och returnera similarity score (0-1).
    - Beräkna avstånd mellan segment-centers
    - Jämför längd
    - Jämför riktning
    """
    
def match_tracks_by_segments(track1: List[TrackPosition], track2: List[TrackPosition]) -> dict:
    """
    Matcha två spår segment för segment.
    Returnera:
    - segment_matches: Vilka segment matchar
    - overall_similarity: 0-1
    - matched_segments_count: Antal matchade segment
    """
```

**API-endpoint:**
```python
@app.get("/tracks/{track_id}/compare-improved")
def compare_tracks_improved(track_id: int):
    """
    Förbättrad jämförelse med segment-based matching.
    Returnera:
    - segment_matches
    - overall_similarity
    - confidence_score (0-100)
    - improved_match_percentage
    """
```

---

#### 2. Confidence score (2 timmar)
**Filer att ändra:**
- `backend/utils/track_comparison.py`

**Funktion:**
```python
def calculate_confidence_score(
    avg_distance: float,
    max_distance: float,
    segment_similarity: float,
    hiding_spots_found: int,
    hiding_spots_total: int,
    gps_accuracy_avg: float
) -> float:
    """
    Beräkna confidence score (0-100) baserat på flera faktorer:
    - Avstånd mellan spår (lägre = bättre)
    - Segment similarity (högre = bättre)
    - Gömställen matchning (högre = bättre)
    - GPS accuracy (högre = bättre)
    """
```

**Resultat:**
- Mer intelligent bedömning av matchning
- Tar hänsyn till flera faktorer

---

#### 3. Frontend: Visualisera matchning (2-3 timmar)
**Filer att ändra:**
- `frontend/src/components/GeofenceEditor.jsx`

**Funktioner:**
- Visa båda spåren över varandra med färgkodning
- Färgkodning baserat på avstånd:
  - Grön: < 10m
  - Gul: 10-30m
  - Orange: 30-50m
  - Röd: > 50m
- Markera matchade segment
- Visa confidence score visuellt (progress bar eller liknande)

---

### Leverabler för dagen
- ✅ Segment-based matching fungerar
- ✅ Confidence score beräknas
- ✅ Förbättrad jämförelse-endpoint
- ✅ Visualisering på kartan

### Testning
1. Skapa två spår med samma rutt men olika timing
2. Jämför med ny endpoint
3. Verifiera att segment matchas korrekt
4. Kontrollera att confidence score är rimligt

---

## Fredag - Visualisering & Polish

### Mål
Förbättra användarupplevelsen med bättre visualisering och feedback.

### Uppgifter

#### 1. Förbättrad jämförelse-vy (2-3 timmar)
**Filer att ändra:**
- `frontend/src/components/GeofenceEditor.jsx`

**Funktioner:**
- Skapa dedikerad jämförelse-vy
- Visa:
  - Båda spåren över varandra
  - Färgkodning baserat på avstånd
  - Matchade segment markeras
  - Confidence score (visuellt)
  - Statistik (förbättrad layout)
  - Gömställen-visualisering (hittade/missade)

**UI-komponenter:**
- Modal eller separat vy för jämförelse
- Toggle för att växla mellan "raw" och "smoothed" spår
- Zoom till områden där spåren är nära varandra

---

#### 2. Real-time accuracy-indikator (1-2 timmar)
**Filer att ändra:**
- `frontend/src/components/GeofenceEditor.jsx`

**Funktioner:**
- Visa nuvarande GPS-accuracy när man spårar
- Färgkodning: grön = bra, röd = dålig
- Varning vid låg accuracy (< 20m)
- Historik över accuracy under spårningen

---

#### 3. Före/efter-visning (2 timmar)
**Filer att ändra:**
- `frontend/src/components/GeofenceEditor.jsx`

**Funktioner:**
- Toggle för att visa "raw" vs "smoothed" spår
- Visa båda samtidigt (olika färger)
- Visa förbättring i match_percentage

---

#### 4. Dokumentation & Testning (1-2 timmar)
**Filer att skapa/uppdatera:**
- `docs/IMPROVEMENTS.md` - Dokumentera förbättringar
- `TEST_INSTRUCTIONS.md` - Uppdatera med nya funktioner

**Uppgifter:**
- Dokumentera GPS-smoothing
- Dokumentera segment-based matching
- Skapa testscenarier
- Uppdatera API-dokumentation

---

### Leverabler för dagen
- ✅ Förbättrad jämförelse-vy
- ✅ Real-time accuracy-indikator
- ✅ Före/efter-visning
- ✅ Dokumentation uppdaterad

### Testning
1. Fullständig test av alla nya funktioner
2. Användarflöde: skapa spår → jämför → analysera
3. Verifiera att allt fungerar tillsammans
4. Performance-test (snabbt nog?)

---

## Veckans sammanfattning

### Tekniska förbättringar
- ✅ GPS-smoothing och filtering
- ✅ Segment-based matching
- ✅ Confidence score
- ✅ Förbättrad visualisering

### Resultat
- **Bättre GPS-noggrannhet**: Renare spår med mindre noise
- **Intelligent jämförelse**: Matchar spår trots GPS-fel
- **Bättre UX**: Mer visuell feedback och förståelse

### För nästa presentation
- ✅ Visa före/efter av GPS-smoothing
- ✅ Visa intelligent jämförelse i aktion
- ✅ Demonstera confidence score
- ✅ Visa förbättrad visualisering

---

## Tidsplan

### Onsdag
- **09:00-12:00**: GPS-smoothing implementation
- **13:00-15:00**: Integrera i jämförelse
- **15:00-16:00**: Frontend accuracy-visning

### Torsdag
- **09:00-13:00**: Segment-based matching
- **13:00-15:00**: Confidence score
- **15:00-17:00**: Frontend visualisering

### Fredag
- **09:00-12:00**: Förbättrad jämförelse-vy
- **13:00-15:00**: Real-time accuracy + före/efter
- **15:00-17:00**: Dokumentation & testning

---

## Kriterier för framgång

### Onsdag
- [ ] GPS-smoothing minskar noise märkbart
- [ ] Speed-filtering tar bort outliers
- [ ] Jämförelse använder smoothade spår

### Torsdag
- [ ] Segment-based matching fungerar
- [ ] Confidence score är rimligt
- [ ] Visualisering visar matchning tydligt

### Fredag
- [ ] Användarupplevelsen är förbättrad
- [ ] All dokumentation är uppdaterad
- [ ] Allt fungerar tillsammans

---

*Plan skapad: [Dagens datum]*
*Status: Klar för implementation*

