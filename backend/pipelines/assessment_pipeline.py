"""
Assessment pipeline: jämförelse och bedömning mellan spår.

Punkt-baserad jämförelse, segment-baserad jämförelse och DTW.
Används efter data_pipeline för att bedöma om hundspår följer referensspåret.
"""

from __future__ import annotations

from typing import Any, Dict, List

from utils.gps_filter import haversine_distance
from utils.track_comparison import compare_tracks_by_segments, dtw_distance


def run_point_assessment(
    human_points: List[Dict[str, Any]],
    dog_points: List[Dict[str, Any]],
    max_match_m: float = 200.0,
) -> Dict[str, Any]:
    """
    Punkt-för-punkt jämförelse: för varje human-punkt, minsta avstånd till dog.

    Returnerar average_meters, max_meters, match_percentage (0–100).
    """
    distances = []
    for hp in human_points:
        min_d = float("inf")
        for dp in dog_points:
            d = haversine_distance(
                hp["lat"], hp["lng"],
                dp["lat"], dp["lng"],
            )
            if d < min_d:
                min_d = d
        distances.append(min_d if min_d <= max_match_m else max_match_m)

    if not distances:
        return {"average_meters": 0.0, "max_meters": 0.0, "match_percentage": 0.0}

    avg = sum(distances) / len(distances)
    max_d = max(distances)
    if avg <= 10:
        match_pct = 100 - (avg * 2)
    elif avg <= 50:
        match_pct = 80 - ((avg - 10) * 1.5)
    elif avg <= 100:
        match_pct = 20 - ((avg - 50) * 0.4)
    else:
        match_pct = 0
    match_pct = max(0, min(100, match_pct))

    return {
        "average_meters": round(avg, 2),
        "max_meters": round(max_d, 2),
        "match_percentage": round(match_pct, 1),
    }


def run_segment_assessment(
    human_points: List[Dict[str, Any]],
    dog_points: List[Dict[str, Any]],
    angle_threshold_deg: float = 30.0,
    max_match_distance_m: float = 200.0,
) -> Dict[str, Any]:
    """
    Segment-baserad jämförelse (riktning, kurvighet, similarity per segment).

    Returnerar overall_similarity, segment_counts, segment_matches.
    """
    return compare_tracks_by_segments(
        human_points,
        dog_points,
        angle_threshold_deg=angle_threshold_deg,
        max_match_distance_m=max_match_distance_m,
    )


def run_dtw_assessment(
    human_points: List[Dict[str, Any]],
    dog_points: List[Dict[str, Any]],
    max_pair_distance_m: float = 200.0,
) -> Dict[str, Any]:
    """
    DTW-jämförelse (Dynamic Time Warping) – tillåter olika hastighet/timing.

    Returnerar dtw_distance, dtw_normalized_avg_m, similarity_score, etc.
    """
    return dtw_distance(
        human_points,
        dog_points,
        max_pair_distance_m=max_pair_distance_m,
    )
