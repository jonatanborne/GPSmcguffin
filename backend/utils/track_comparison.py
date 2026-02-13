"""
Utilities for segment-based track comparison between human and dog tracks.

The goal is to go beyond point-to-point averages and instead:
- Split each track into direction-based segments
- Compute per-segment similarity based on distances between tracks
- Aggregate to an overall similarity score that is robust to timing differences

All functions in this module operate on simple dictionaries so they can be
used from FastAPI without importing backend models (to avoid circular imports).
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from utils.gps_filter import haversine_distance


Point = Dict[str, Any]  # Expected keys: lat, lng, optional timestamp


def _bearing_degrees(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate compass bearing from point 1 to point 2 in degrees (0-360)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_lambda = math.radians(lon2 - lon1)

    y = math.sin(d_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(
        d_lambda
    )

    theta = math.degrees(math.atan2(y, x))
    return (theta + 360.0) % 360.0


def _angle_difference_deg(a: float, b: float) -> float:
    """Smallest absolute difference between two angles in degrees (0-180)."""
    diff = abs(a - b) % 360.0
    return diff if diff <= 180.0 else 360.0 - diff


def _build_segment(points: List[Point], start_idx: int, end_idx: int) -> Dict[str, Any]:
    """Build a segment summary from a slice of points [start_idx, end_idx]."""
    if start_idx < 0 or end_idx >= len(points) or start_idx > end_idx:
        raise ValueError("Invalid segment indexes")

    idxs = list(range(start_idx, end_idx + 1))
    point_count = len(idxs)

    # Centroid
    sum_lat = sum(points[i]["lat"] for i in idxs)
    sum_lng = sum(points[i]["lng"] for i in idxs)
    centroid_lat = sum_lat / point_count
    centroid_lng = sum_lng / point_count

    # Length
    length_m = 0.0
    for i in range(start_idx, end_idx):
        p1 = points[i]
        p2 = points[i + 1]
        length_m += haversine_distance(p1["lat"], p1["lng"], p2["lat"], p2["lng"])

    # Average bearing across the segment
    bearings: List[float] = []
    for i in range(start_idx + 1, end_idx + 1):
        p1 = points[i - 1]
        p2 = points[i]
        bearings.append(_bearing_degrees(p1["lat"], p1["lng"], p2["lat"], p2["lng"]))

    avg_bearing: Optional[float]
    if bearings:
        # Simple circular mean approximation
        sin_sum = sum(math.sin(math.radians(b)) for b in bearings)
        cos_sum = sum(math.cos(math.radians(b)) for b in bearings)
        avg_bearing = (math.degrees(math.atan2(sin_sum, cos_sum)) + 360.0) % 360.0
    else:
        avg_bearing = None

    return {
        "start_index": start_idx,
        "end_index": end_idx,
        "point_indexes": idxs,
        "point_count": point_count,
        "length_m": length_m,
        "centroid_lat": centroid_lat,
        "centroid_lng": centroid_lng,
        "avg_bearing_deg": avg_bearing,
    }


def split_track_into_segments(
    points: List[Point],
    angle_threshold_deg: float = 30.0,
    min_points_per_segment: int = 3,
) -> List[Dict[str, Any]]:
    """
    Split a track into direction-based segments.

    A new segment is started when the direction changes more than
    `angle_threshold_deg` compared to the current segment's average direction
    and the current segment has at least `min_points_per_segment` points.
    """
    if not points:
        return []
    if len(points) == 1:
        return [_build_segment(points, 0, 0)]

    segments: List[Dict[str, Any]] = []

    current_start = 0
    current_bearings: List[float] = []

    # Initialize first bearing if possible
    first_bearing = _bearing_degrees(
        points[0]["lat"], points[0]["lng"], points[1]["lat"], points[1]["lng"]
    )
    current_bearings.append(first_bearing)

    for i in range(2, len(points)):
        prev = points[i - 1]
        curr = points[i]
        bearing = _bearing_degrees(prev["lat"], prev["lng"], curr["lat"], curr["lng"])

        avg_bearing = sum(current_bearings) / len(current_bearings)
        if (
            _angle_difference_deg(avg_bearing, bearing) > angle_threshold_deg
            and (i - current_start) >= min_points_per_segment
        ):
            # Close current segment at i-1 and start new at i-1 (keep corner point)
            segments.append(_build_segment(points, current_start, i - 1))
            current_start = i - 1
            current_bearings = [bearing]
        else:
            current_bearings.append(bearing)

    # Close final segment
    segments.append(_build_segment(points, current_start, len(points) - 1))
    return segments


def _distance_to_similarity_score(distance_m: float) -> float:
    """
    Map an average distance in meters to a similarity score 0-100.

    Mirrors the existing match_percentage logic used for point-based comparison.
    """
    if distance_m <= 10:
        match_percentage = 100 - (distance_m * 2)  # 0-10m: 100-80%
    elif distance_m <= 50:
        match_percentage = 80 - ((distance_m - 10) * 1.5)  # 10-50m: 80-20%
    elif distance_m <= 100:
        match_percentage = 20 - ((distance_m - 50) * 0.4)  # 50-100m: 20-0%
    else:
        match_percentage = 0

    return max(0.0, min(100.0, match_percentage))


def compare_tracks_by_segments(
    human_points: List[Point],
    dog_points: List[Point],
    angle_threshold_deg: float = 30.0,
    max_match_distance_m: float = 200.0,
) -> Dict[str, Any]:
    """
    Compare two tracks segment-by-segment.

    - Human track is treated as reference
    - For each human segment we compute:
      - Average distance to the nearest dog position per point in the segment
      - Max distance
      - Similarity score (0-100) based on average distance
      - Nearest dog segment (by centroid distance)

    Returns a dict suitable to embed directly in API responses.
    """
    if not human_points or not dog_points:
        return {
            "overall_similarity": 0.0,
            "segment_counts": {"human_segments": 0, "dog_segments": 0},
            "segment_matches": [],
        }

    human_segments = split_track_into_segments(
        human_points,
        angle_threshold_deg=angle_threshold_deg,
    )
    dog_segments = split_track_into_segments(
        dog_points,
        angle_threshold_deg=angle_threshold_deg,
    )

    segment_matches: List[Dict[str, Any]] = []
    total_weighted_similarity = 0.0
    total_points = 0

    for h_index, h_seg in enumerate(human_segments):
        idxs = h_seg["point_indexes"]
        if not idxs:
            continue

        distances: List[float] = []

        # For each point in the human segment, find nearest dog position
        for idx in idxs:
            hp = human_points[idx]
            min_d = float("inf")
            for dp in dog_points:
                d = haversine_distance(hp["lat"], hp["lng"], dp["lat"], dp["lng"])
                if d < min_d:
                    min_d = d

            if min_d <= max_match_distance_m:
                distances.append(min_d)
            else:
                distances.append(max_match_distance_m)

        if distances:
            avg_d = sum(distances) / len(distances)
            max_d = max(distances)
        else:
            avg_d = max_match_distance_m
            max_d = max_match_distance_m

        similarity = _distance_to_similarity_score(avg_d)

        # Find closest dog segment by centroid distance
        matched_dog_index: Optional[int] = None
        centroid_distance_m: Optional[float] = None

        if dog_segments:
            min_centroid_dist = float("inf")
            for d_index, d_seg in enumerate(dog_segments):
                d = haversine_distance(
                    h_seg["centroid_lat"],
                    h_seg["centroid_lng"],
                    d_seg["centroid_lat"],
                    d_seg["centroid_lng"],
                )
                if d < min_centroid_dist:
                    min_centroid_dist = d
                    matched_dog_index = d_index
            centroid_distance_m = min_centroid_dist

        segment_matches.append(
            {
                "human_segment_index": h_index,
                "dog_segment_index": matched_dog_index,
                "avg_distance_m": avg_d,
                "max_distance_m": max_d,
                "similarity": similarity,
                "point_count": len(idxs),
                "human_segment_length_m": h_seg["length_m"],
                "centroid_distance_m": centroid_distance_m,
            }
        )

        total_weighted_similarity += similarity * len(idxs)
        total_points += len(idxs)

    overall_similarity = (
        total_weighted_similarity / total_points if total_points > 0 else 0.0
    )

    return {
        "overall_similarity": overall_similarity,
        "segment_counts": {
            "human_segments": len(human_segments),
            "dog_segments": len(dog_segments),
        },
        "segment_matches": segment_matches,
    }

