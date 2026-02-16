"""
Data pipeline: filtering och smoothing av GPS-positioner.

Tar råa positioner (t.ex. från DB) och returnerar rensade, smootade punkter
så att jämförelse och bedömning jobbar på bättre data.
Använder utils.gps_filter under huven.
"""

from __future__ import annotations

from typing import Any, Dict, List

from utils.gps_filter import apply_full_filter_pipeline


def db_rows_to_pipeline_format(
    rows: List[Dict[str, Any]],
    lat_key: str = "position_lat",
    lng_key: str = "position_lng",
) -> List[Dict[str, Any]]:
    """Konvertera DB-rader till format som gps_filter förväntar sig."""
    out = []
    for r in rows:
        lat = r.get(lat_key) or r.get("position_lat")
        lng = r.get(lng_key) or r.get("position_lng")
        if lat is None or lng is None:
            continue
        out.append({
            "position": {"lat": float(lat), "lng": float(lng)},
            "timestamp": r.get("timestamp"),
            "accuracy": r.get("accuracy"),
        })
    return out


def smoothed_positions_to_points(smoothed_positions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extrahera lat/lng från pipeline-utdata (använd smoothed_position om finns)."""
    points = []
    for p in smoothed_positions:
        coords = p.get("smoothed_position") or p.get("position")
        if not coords:
            continue
        points.append({
            "lat": coords["lat"],
            "lng": coords["lng"],
            "timestamp": p.get("timestamp"),
        })
    return points


def run(
    position_rows: List[Dict[str, Any]],
    track_type: str = "human",
    smooth_window: int = 3,
    max_accuracy_m: float = 50.0,
) -> Dict[str, Any]:
    """
    Kör data-pipelinen: filter (accuracy, hastighet) + smoothing.

    Args:
        position_rows: Rader med position_lat, position_lng, timestamp, accuracy (t.ex. från DB).
        track_type: 'human' eller 'dog' (styr hastighetsgräns).
        smooth_window: Fönsterstorlek för moving average.
        max_accuracy_m: Max godtagbar accuracy i meter.

    Returns:
        {
            "points": [{"lat", "lng", "timestamp"}, ...],  # Smootade punkter för jämförelse
            "filter_stats": {...},  # improvement_stats från gps_filter
        }
        Om position_rows är tom returneras points=[] och filter_stats=None.
    """
    if not position_rows:
        return {"points": [], "filter_stats": None}

    pipeline_input = db_rows_to_pipeline_format(position_rows)
    if not pipeline_input:
        return {"points": [], "filter_stats": None}

    result = apply_full_filter_pipeline(
        pipeline_input,
        track_type=track_type,
        smooth_window=smooth_window,
        max_accuracy_m=max_accuracy_m,
    )
    points = smoothed_positions_to_points(result["smoothed_positions"])
    return {
        "points": points,
        "filter_stats": result.get("improvement_stats"),
    }
