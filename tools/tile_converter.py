#!/usr/bin/env python3
"""
Tile Converter - Förstorar kartbilder för bättre zoom och detaljer

Detta script laddar ner tile-bilder från en tile server, förstorar dem
och sparar dem i en struktur som kan användas som lokal tile layer.

Användning:
    python tile_converter.py --bounds 59.3,18.0,59.4,18.1 --zoom 14-18 --output tiles/
"""

import argparse
import io
import requests
from PIL import Image, ImageEnhance
import math
from pathlib import Path
from typing import Tuple, List
import time

# Tile server URLs
TILE_SERVERS = {
    "osm": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    "esri_street": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    "esri_satellite": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
}


def deg2num(lat_deg: float, lon_deg: float, zoom: int) -> Tuple[int, int]:
    """Konvertera lat/lng till tile koordinater"""
    lat_rad = math.radians(lat_deg)
    n = 2.0**zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (xtile, ytile)


def num2deg(xtile: int, ytile: int, zoom: int) -> Tuple[float, float]:
    """Konvertera tile koordinater till lat/lng"""
    n = 2.0**zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)
    return (lat_deg, lon_deg)


def get_tile_bounds(
    min_lat: float, min_lon: float, max_lat: float, max_lon: float, zoom: int
) -> Tuple[int, int, int, int]:
    """Hämta tile-område för given bounding box"""
    x_min, y_max = deg2num(max_lat, min_lon, zoom)
    x_max, y_min = deg2num(min_lat, max_lon, zoom)
    return (x_min, y_min, x_max, y_max)


def download_tile(
    server_url: str, x: int, y: int, z: int, subdomain: str = "a"
) -> bytes:
    """Ladda ner en tile"""
    url = server_url.format(s=subdomain, x=x, y=y, z=z)
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return response.content
    except Exception as e:
        print(f"Fel vid nedladdning av tile {z}/{x}/{y}: {e}")
        return None


def upscale_tile(image: Image.Image, scale_factor: int = 2) -> Image.Image:
    """Förstora en tile med hög kvalitet"""
    # Använd LANCZOS för bästa kvalitet vid uppskalning
    new_size = (image.width * scale_factor, image.height * scale_factor)
    upscaled = image.resize(new_size, Image.Resampling.LANCZOS)

    # Förbättra skärpan lite
    enhancer = ImageEnhance.Sharpness(upscaled)
    upscaled = enhancer.enhance(1.2)

    return upscaled


def download_and_process_tiles(
    bounds: Tuple[float, float, float, float],
    zoom_levels: List[int],
    server: str,
    output_dir: str,
    scale_factor: int = 2,
    delay: float = 0.1,
):
    """Ladda ner och förstora tiles för ett område"""
    min_lat, min_lon, max_lat, max_lon = bounds
    server_url = TILE_SERVERS.get(server)

    if not server_url:
        print(f"Okänd server: {server}")
        return

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    total_tiles = 0
    downloaded_tiles = 0

    for zoom in zoom_levels:
        print(f"\nBearbetar zoom level {zoom}...")
        x_min, y_min, x_max, y_max = get_tile_bounds(
            min_lat, min_lon, max_lat, max_lon, zoom
        )

        zoom_dir = output_path / str(zoom)
        zoom_dir.mkdir(exist_ok=True)

        for x in range(x_min, x_max + 1):
            x_dir = zoom_dir / str(x)
            x_dir.mkdir(exist_ok=True)

            for y in range(y_min, y_max + 1):
                total_tiles += 1
                tile_path = x_dir / f"{y}.png"

                # Hoppa över om redan nedladdad
                if tile_path.exists():
                    print(f"  Hoppar över {zoom}/{x}/{y} (redan finns)")
                    continue

                # Ladda ner tile
                tile_data = download_tile(server_url, x, y, zoom)
                if tile_data is None:
                    continue

                try:
                    # Öppna bild
                    img = Image.open(io.BytesIO(tile_data))

                    # Förstora om scale_factor > 1
                    if scale_factor > 1:
                        img = upscale_tile(img, scale_factor)

                    # Spara förstorad tile
                    img.save(tile_path, "PNG", optimize=True)
                    downloaded_tiles += 1

                    if downloaded_tiles % 10 == 0:
                        print(f"  Nedladdade {downloaded_tiles} tiles...")

                    # Vänta lite för att inte överbelasta servern
                    time.sleep(delay)

                except Exception as e:
                    print(f"  Fel vid bearbetning av {zoom}/{x}/{y}: {e}")
                    continue

    print(f"\nKlar! Nedladdade {downloaded_tiles} av {total_tiles} tiles.")
    print(f"Tiles sparade i: {output_path.absolute()}")


def main():
    parser = argparse.ArgumentParser(description="Konvertera och förstora kartbilder")
    parser.add_argument(
        "--bounds",
        required=True,
        help="Bounding box: min_lat,min_lon,max_lat,max_lon (t.ex. 59.3,18.0,59.4,18.1)",
    )
    parser.add_argument(
        "--zoom", default="14-18", help="Zoom levels (t.ex. 14-18 eller 15,16,17)"
    )
    parser.add_argument(
        "--server",
        default="esri_street",
        choices=["osm", "esri_street", "esri_satellite"],
        help="Tile server att använda",
    )
    parser.add_argument("--output", default="tiles", help="Output directory")
    parser.add_argument(
        "--scale",
        type=int,
        default=2,
        help="Förstoringsfaktor (2 = dubbel storlek, 3 = tredubbel, etc.)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.1,
        help="Delay mellan nedladdningar i sekunder (för att inte överbelasta servern)",
    )

    args = parser.parse_args()

    # Parse bounds
    bounds_parts = [float(x.strip()) for x in args.bounds.split(",")]
    if len(bounds_parts) != 4:
        print("Fel: bounds måste vara 4 värden: min_lat,min_lon,max_lat,max_lon")
        return
    bounds = tuple(bounds_parts)

    # Parse zoom levels
    if "-" in args.zoom:
        zoom_parts = args.zoom.split("-")
        zoom_levels = list(range(int(zoom_parts[0]), int(zoom_parts[1]) + 1))
    else:
        zoom_levels = [int(x.strip()) for x in args.zoom.split(",")]

    print(f"Konverterar tiles för område: {bounds}")
    print(f"Zoom levels: {zoom_levels}")
    print(f"Server: {args.server}")
    print(f"Förstoringsfaktor: {args.scale}x")
    print(f"Output: {args.output}")

    download_and_process_tiles(
        bounds, zoom_levels, args.server, args.output, args.scale, args.delay
    )


if __name__ == "__main__":
    import io

    main()
