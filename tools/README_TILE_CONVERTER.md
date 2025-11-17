# Tile Converter - Förstorade Kartbilder

Detta verktyg laddar ner kartbilder (tiles) från tile-servrar, förstorar dem för bättre upplösning och sparar dem lokalt.

## Installation

```bash
pip install pillow requests
```

## Användning

### Grundläggande användning

```bash
python tools/tile_converter.py \
  --bounds 59.3,18.0,59.4,18.1 \
  --zoom 14-18 \
  --server esri_street \
  --output tiles/ \
  --scale 2
```

### Parametrar

- `--bounds`: Bounding box i format `min_lat,min_lon,max_lat,max_lon`
  - Exempel: `59.3,18.0,59.4,18.1` (Stockholm-område)
  
- `--zoom`: Zoom levels att ladda ner
  - Range: `14-18` (alla nivåer från 14 till 18)
  - Lista: `15,16,17` (specifika nivåer)
  
- `--server`: Vilken tile server att använda
  - `osm`: OpenStreetMap
  - `esri_street`: Esri World Street Map (rekommenderas)
  - `esri_satellite`: Esri World Imagery (satellitbilder)
  
- `--output`: Var tiles ska sparas (default: `tiles/`)
  
- `--scale`: Förstoringsfaktor (default: 2)
  - `2` = dubbel storlek (256x256 → 512x512)
  - `3` = tredubbel storlek (256x256 → 768x768)
  - `4` = fyrdubbel storlek (256x256 → 1024x1024)
  
- `--delay`: Sekunder att vänta mellan nedladdningar (default: 0.1)
  - Öka detta om servern begränsar antal requests

### Exempel

**Ladda ner och förstora tiles för Stockholm-området:**
```bash
python tools/tile_converter.py \
  --bounds 59.2,17.9,59.4,18.2 \
  --zoom 15-20 \
  --server esri_street \
  --output tiles/stockholm \
  --scale 2
```

**Ladda ner satellitbilder med hög upplösning:**
```bash
python tools/tile_converter.py \
  --bounds 59.3,18.0,59.4,18.1 \
  --zoom 16-20 \
  --server esri_satellite \
  --output tiles/satellite \
  --scale 3
```

## Använda förstorade tiles i appen

Efter att ha laddat ner och förstorat tiles, kan du använda dem i TestLab genom att:

1. **Spara tiles i en statisk mapp** (t.ex. `frontend/public/tiles/`)

2. **Lägg till en lokal tile layer i TestLab.jsx:**

```javascript
// Lägg till efter de andra tile layers
const localHighResLayer = L.tileLayer('tiles/{z}/{x}/{y}.png', {
    attribution: '© Lokal högupplösning',
    maxZoom: 20, // Anpassa efter dina zoom levels
    tileSize: 512, // Om du förstorade med faktor 2
    zoomOffset: 0
})

// Lägg till i baseMaps
const baseMaps = {
    'OpenStreetMap': osmLayer,
    'Esri Satellit': esriImageryLayer,
    'Esri Gatukarta': esriStreetLayer,
    'CartoDB Ljus': cartoPositronLayer,
    'Lokal Högupplösning': localHighResLayer, // Ny layer
}
```

**Viktigt:** Om du förstorade tiles med faktor 2, sätt `tileSize: 512`. Om faktor 3, sätt `tileSize: 768`, etc.

## Tips

- **Börja med ett litet område** för att testa
- **Använd `--delay 0.2`** om servern begränsar requests
- **Förstoringsfaktor 2-3** ger bra balans mellan kvalitet och filstorlek
- **Spara tiles i `frontend/public/tiles/`** för enkel åtkomst i appen

## Filstruktur

Efter konvertering kommer tiles att ligga i strukturen:
```
tiles/
  ├── 14/
  │   ├── 1234/
  │   │   ├── 5678.png
  │   │   └── 5679.png
  │   └── 1235/
  │       └── ...
  ├── 15/
  └── ...
```

Detta matchar Leaflet's tile URL-struktur: `{z}/{x}/{y}.png`

