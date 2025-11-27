"""
GPS filtering and smoothing utilities for improving GPS accuracy.

Functions for:
- Smoothing GPS tracks using moving average
- Filtering outliers based on speed
- Filtering positions with poor accuracy
"""

import math
from typing import List, Dict, Tuple, Optional


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on earth (in meters).
    
    Args:
        lat1, lon1: First point coordinates
        lat2, lon2: Second point coordinates
        
    Returns:
        Distance in meters
    """
    R = 6371000  # Earth radius in meters
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2) ** 2
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def calculate_speed(pos1: Dict, pos2: Dict) -> Optional[float]:
    """
    Calculate speed between two positions in km/h.
    
    Args:
        pos1: First position with lat, lng, timestamp
        pos2: Second position with lat, lng, timestamp
        
    Returns:
        Speed in km/h, or None if time difference is 0
    """
    from datetime import datetime
    
    # Parse timestamps
    if isinstance(pos1.get('timestamp'), str):
        time1 = datetime.fromisoformat(pos1['timestamp'].replace('Z', '+00:00'))
    else:
        time1 = pos1['timestamp']
        
    if isinstance(pos2.get('timestamp'), str):
        time2 = datetime.fromisoformat(pos2['timestamp'].replace('Z', '+00:00'))
    else:
        time2 = pos2['timestamp']
    
    # Calculate time difference in seconds
    time_diff = abs((time2 - time1).total_seconds())
    
    if time_diff == 0:
        return None
    
    # Calculate distance
    distance = haversine_distance(
        pos1['position']['lat'], pos1['position']['lng'],
        pos2['position']['lat'], pos2['position']['lng']
    )
    
    # Convert to km/h
    speed_kmh = (distance / time_diff) * 3.6
    
    return speed_kmh


def smooth_track_positions(positions: List[Dict], window_size: int = 3) -> List[Dict]:
    """
    Apply moving average smoothing to GPS positions.
    
    Args:
        positions: List of position objects with lat/lng
        window_size: Size of the moving average window (default: 3)
        
    Returns:
        List of positions with smoothed coordinates
    """
    if len(positions) < window_size:
        return positions
    
    smoothed = []
    
    for i, pos in enumerate(positions):
        # Determine window bounds
        start_idx = max(0, i - window_size // 2)
        end_idx = min(len(positions), i + window_size // 2 + 1)
        
        # Calculate average position within window
        window_positions = positions[start_idx:end_idx]
        avg_lat = sum(p['position']['lat'] for p in window_positions) / len(window_positions)
        avg_lng = sum(p['position']['lng'] for p in window_positions) / len(window_positions)
        
        # Create smoothed position
        smoothed_pos = pos.copy()
        smoothed_pos['smoothed_position'] = {
            'lat': avg_lat,
            'lng': avg_lng
        }
        
        smoothed.append(smoothed_pos)
    
    return smoothed


def filter_speed_outliers(
    positions: List[Dict], 
    max_speed_kmh: float = 50.0,
    track_type: str = 'human'
) -> Tuple[List[Dict], List[Dict]]:
    """
    Filter out positions with unrealistic speeds.
    
    Args:
        positions: List of position objects
        max_speed_kmh: Maximum realistic speed in km/h (default: 50 for human)
        track_type: 'human' or 'dog' (affects default max speed)
        
    Returns:
        Tuple of (valid_positions, outliers)
    """
    # Adjust max speed based on track type
    if track_type == 'dog':
        max_speed_kmh = max_speed_kmh if max_speed_kmh != 50.0 else 100.0
    
    if len(positions) < 2:
        return positions, []
    
    valid_positions = [positions[0]]  # Always keep first position
    outliers = []
    
    for i in range(1, len(positions)):
        speed = calculate_speed(positions[i-1], positions[i])
        
        if speed is None or speed <= max_speed_kmh:
            valid_positions.append(positions[i])
        else:
            outliers.append({
                **positions[i],
                'outlier_reason': f'speed_too_high',
                'calculated_speed': speed
            })
    
    return valid_positions, outliers


def filter_accuracy_outliers(
    positions: List[Dict],
    max_accuracy_meters: float = 50.0
) -> Tuple[List[Dict], List[Dict]]:
    """
    Filter out positions with poor GPS accuracy.
    
    Args:
        positions: List of position objects with accuracy field
        max_accuracy_meters: Maximum acceptable accuracy in meters (default: 50)
        
    Returns:
        Tuple of (valid_positions, outliers)
    """
    valid_positions = []
    outliers = []
    
    for pos in positions:
        accuracy = pos.get('accuracy')
        
        if accuracy is None or accuracy <= max_accuracy_meters:
            valid_positions.append(pos)
        else:
            outliers.append({
                **pos,
                'outlier_reason': 'accuracy_too_poor',
                'accuracy': accuracy
            })
    
    return valid_positions, outliers


def apply_full_filter_pipeline(
    positions: List[Dict],
    track_type: str = 'human',
    smooth_window: int = 3,
    max_speed_kmh: Optional[float] = None,
    max_accuracy_m: float = 50.0
) -> Dict:
    """
    Apply complete filtering and smoothing pipeline to GPS positions.
    
    Args:
        positions: List of position objects
        track_type: 'human' or 'dog'
        smooth_window: Window size for moving average
        max_speed_kmh: Max speed threshold (auto-set based on track_type if None)
        max_accuracy_m: Max acceptable accuracy in meters
        
    Returns:
        Dict with:
        - original_count: Number of original positions
        - filtered_positions: Positions after filtering
        - smoothed_positions: Smoothed filtered positions
        - speed_outliers: Positions removed due to speed
        - accuracy_outliers: Positions removed due to accuracy
        - improvement_stats: Statistics about improvements
    """
    original_count = len(positions)
    
    # Step 1: Filter by accuracy
    after_accuracy, accuracy_outliers = filter_accuracy_outliers(
        positions, max_accuracy_m
    )
    
    # Step 2: Filter by speed
    if max_speed_kmh is None:
        max_speed_kmh = 100.0 if track_type == 'dog' else 50.0
    
    after_speed, speed_outliers = filter_speed_outliers(
        after_accuracy, max_speed_kmh, track_type
    )
    
    # Step 3: Apply smoothing
    smoothed = smooth_track_positions(after_speed, smooth_window)
    
    # Calculate improvement statistics
    improvement_stats = {
        'original_count': original_count,
        'after_filtering': len(after_speed),
        'removed_by_accuracy': len(accuracy_outliers),
        'removed_by_speed': len(speed_outliers),
        'total_removed': len(accuracy_outliers) + len(speed_outliers),
        'retention_rate': len(after_speed) / original_count if original_count > 0 else 0
    }
    
    return {
        'original_count': original_count,
        'filtered_positions': after_speed,
        'smoothed_positions': smoothed,
        'speed_outliers': speed_outliers,
        'accuracy_outliers': accuracy_outliers,
        'improvement_stats': improvement_stats
    }

