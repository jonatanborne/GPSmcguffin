# Guide: Använda förstorade kartor i TestLab

## Problem

När du zoomar in tillräckligt nära för att se varje GPS-position individuellt, försvinner kartbilden. Detta gör det omöjligt att göra exakta korrigeringar av GPS-positioner.

## Lösning

Ladda ner och förstora kartbilder för ditt specifika spårområde.

---

## Metod 1: Använd TestLab (Rekommenderas - Enklast)

### Steg-för-steg:

1. **Öppna TestLab**

   - Gå till appen och välj TestLab-läget

2. **Ladda ett spår**

   - Välj ett Human Track från dropdown-menyn
   - Spåret kommer visas på kartan

3. **Ladda ner högupplösta tiles**

   - Scrolla ner i sidebaren
   - **Välj kartkälla** i dropdown: **Esri Satellit** (bäst upplösning för terräng/skog), Esri Gatukarta, eller CartoDB Ljus
   - Klicka på knappen **"Ladda ner högupplösta kartor (4x zoom)"**
   - Vänta medan systemet laddar ner och förstorar tiles (kan ta 1-5 minuter beroende på området)
   - Du kommer se meddelandet: "✅ Tiles sparade för hela spårområdet"

4. **Växla till högupplösta kartan**

   - I övre högra hörnet på kartan finns en kartväljare (layer control)
   - Klicka på den och välj **"Lokal Högupplösning"**
   - Nu kan du zooma in 4x närmare än tidigare!

5. **Börja annotera**
   - Zooma in så att du ser varje position tydligt
   - Kartan kommer fortsätta visa detaljer även vid mycket hög zoom
   - Gör exakta korrigeringar av GPS-positioner

### Vad händer i bakgrunden:

- Systemet identifierar området där spåret ligger (bounding box)
- Laddar ner kartbilder (tiles) från vald källa (Esri Satellit, Gatukarta eller CartoDB Ljus)
- Förstorar varje tile 4x (256x256 → 1024x1024 pixlar)
- Sparar dem lokalt på servern
- Tiles serveras från `/static/tiles/` när du väljer "Lokal Högupplösning"

---

## Metod 2: Manuell nedladdning (Avancerat)

Om du vill ha mer kontroll eller behöver använda satellitbilder:

### 1. Identifiera området

Hitta koordinaterna för ditt spårområde:

```
Min lat, Min lng, Max lat, Max lng
Exempel: 59.3, 18.0, 59.4, 18.1
```

### 2. Kör tile converter

```bash
cd backend
python -m tools.tile_converter \
  --bounds 59.3,18.0,59.4,18.1 \
  --zoom 14-23 \
  --server esri_street \
  --output tiles/ \
  --scale 4 \
  --delay 0.2
```

**Parametrar:**

- `--bounds`: Ditt spårområde (min_lat,min_lng,max_lat,max_lng)
- `--zoom`: Zoom-nivåer att ladda (14-23 rekommenderas)
- `--server`: Vilken karta att använda
  - `esri_street` = Gatukarta (bra för de flesta fall)
  - `esri_satellite` = Satellitbild (bra för att se terräng)
- `--scale`: Förstoring (4 = 4x bättre zoom)
- `--delay`: Paus mellan nedladdningar (0.2s för att inte överbelasta servern)

### 3. Tiles sparas automatiskt

Tiles sparas i `backend/tiles/` och blir automatiskt tillgängliga via `/static/tiles/`

---

## Tips & Tricks

### Optimal zoom-nivåer baserat på spårstorlek:

**Litet område (<1 km):**

```bash
--zoom 14-23 --scale 4
```

Ger maximal detalj för små områden.

**Medelstort område (1-10 km):**

```bash
--zoom 12-22 --scale 3
```

Balans mellan kvalitet och nedladdningstid.

**Stort område (>10 km):**

```bash
--zoom 10-20 --scale 2
```

Rimlig nedladdningstid, fortfarande bra detalj.

### Val av kartserver:

- **esri_street** (Standard): Bra gatukarta med vägar och platser
- **esri_satellite**: Satellitbild, perfekt för att se terräng, skog, öppna fält
- **osm**: OpenStreetMap, öppen data men ofta lägre kvalitet

### Hur mycket kommer det ta?

Estimat för nedladdning:

- **Litet område** (1 km²): ~500-1000 tiles, 2-5 minuter
- **Medelstort område** (10 km²): ~2000-5000 tiles, 10-20 minuter
- **Stort område** (100 km²): ~10000+ tiles, 30-60 minuter

**Filstorlek:**

- Scale 2: ~200-500 KB per tile
- Scale 3: ~400-800 KB per tile
- Scale 4: ~600-1000 KB per tile

---

## Felsökning

### Problem: "Tiles saknas" när jag zoomar in

**Lösning:**

1. Kontrollera att du har laddat ner tiles för rätt område
2. Kolla att zoom-nivåerna täcker där du försöker zooma (minst zoom 20-23)
3. Testa att ladda ner tiles igen med högre zoom-nivåer

### Problem: Kartbilden är suddig när jag zoomar in

**Lösning:**
Öka scale factor:

```bash
--scale 4  # Istället för 2 eller 3
```

### Problem: Nedladdningen tar för lång tid

**Lösning:**

1. Minska området (`--bounds` mindre område)
2. Minska zoom-nivåer (`--zoom 15-21` istället för 14-23)
3. Minska scale factor (`--scale 2` istället för 4)

### Problem: "Error 429" vid nedladdning

**Lösning:**
Servern begränsar requests. Öka delay:

```bash
--delay 0.5  # Eller högre
```

---

## Best Practices för annotering

1. **Ladda ner tiles FÖRST** innan du börjar annotera
2. **Använd samma kartserver** som du laddat ner tiles från
3. **Zooma in tills du ser enskilda positioner klart**
4. **Jämför human track med dog track** för att se var "rätt" position borde vara
5. **Använd satellitbild** om du tränar i skog/natur där det är svårt att se riktmärken på gatukarta

---

## Nästa steg

Efter att du har laddat ner tiles och kan zooma in ordentligt:

1. Börja annotera GPS-positioner (märk som correct/incorrect)
2. Gör manuella korrigeringar där GPS är fel
3. Samla tillräckligt med data (minst 500-1000 annoterade positioner)
4. Data används för att träna ML-modellen för automatisk GPS-korrektion

---

**Status**: Uppdaterad 2026-02  
**Scale factor**: 4x (ger 4x bättre zoom)  
**Max zoom**: 26 (extrem zoom – satellit/layer skalar upp vid 24–26, lite pixeligare)
