from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime
import math


app = FastAPI(title="Dogtracks Geofence Kit", version="0.1.0")

# CORS - Tillåt anrop från alla domäner (för development/prototyping)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # I produktion, sätt specifika domäner
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LatLng(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class CircleGeofence(BaseModel):
    type: Literal["circle"] = "circle"
    center: LatLng
    radius_m: float = Field(..., gt=0)


class PolygonGeofence(BaseModel):
    type: Literal["polygon"] = "polygon"
    vertices: List[LatLng] = Field(..., min_length=3)


GeofenceShape = CircleGeofence | PolygonGeofence


class GeofenceCreate(BaseModel):
    name: Optional[str] = None
    geofence: GeofenceShape


class Geofence(GeofenceCreate):
    id: int


class Position(BaseModel):
    position: LatLng


class TrackPosition(BaseModel):
    position: LatLng
    timestamp: str  # ISO format datetime string
    accuracy: Optional[float] = None  # GPS accuracy in meters


class TrackCreate(BaseModel):
    name: Optional[str] = None
    track_type: Literal["human", "dog"] = "human"


class Track(TrackCreate):
    id: int
    created_at: str
    positions: List[TrackPosition] = []


class TrackPositionAdd(BaseModel):
    position: LatLng
    accuracy: Optional[float] = None


# In-memory storage for simplicity during prototyping
geofences: List[Geofence] = []
next_id: int = 1

tracks: List[Track] = []
next_track_id: int = 1


@app.get("/ping")
def ping():
    return {"status": "ok"}


@app.post("/geofences", response_model=Geofence)
def create_geofence(payload: GeofenceCreate):
    global next_id
    new = Geofence(id=next_id, **payload.dict())
    geofences.append(new)
    next_id += 1
    return new


@app.get("/geofences", response_model=List[Geofence])
def list_geofences():
    return geofences


@app.delete("/geofences/{geofence_id}")
def delete_geofence(geofence_id: int):
    idx = next((i for i, g in enumerate(geofences) if g.id == geofence_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Geofence not found")
    geofences.pop(idx)
    return {"deleted": geofence_id}


def haversine_meters(a: LatLng, b: LatLng) -> float:
    R = 6371000.0
    phi1 = math.radians(a.lat)
    phi2 = math.radians(b.lat)
    dphi = math.radians(b.lat - a.lat)
    dlambda = math.radians(b.lng - a.lng)
    s = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * R * math.atan2(math.sqrt(s), math.sqrt(1 - s))


def point_in_polygon(point: LatLng, polygon: List[LatLng]) -> bool:
    # Ray casting algorithm
    x = point.lng
    y = point.lat
    inside = False
    n = len(polygon)
    for i in range(n):
        j = (i - 1) % n
        xi = polygon[i].lng
        yi = polygon[i].lat
        xj = polygon[j].lng
        yj = polygon[j].lat
        intersect = ((yi > y) != (yj > y)) and (
            x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi
        )
        if intersect:
            inside = not inside
    return inside


@app.post("/evaluate")
def evaluate_position(payload: Position):
    pos = payload.position
    results = []
    for g in geofences:
        shape = g.geofence
        if isinstance(shape, CircleGeofence):
            dist = haversine_meters(pos, shape.center)
            inside = dist <= shape.radius_m
        else:
            inside = point_in_polygon(pos, shape.vertices)
        results.append(
            {
                "geofence_id": g.id,
                "name": g.name,
                "inside": inside,
            }
        )
    return {"position": pos, "results": results}


# Track endpoints
@app.post("/tracks", response_model=Track)
def create_track(payload: TrackCreate):
    global next_track_id
    now = datetime.now().isoformat()
    name = payload.name or f"{payload.track_type.capitalize()} Track {next_track_id}"
    new_track = Track(
        id=next_track_id,
        name=name,
        track_type=payload.track_type,
        created_at=now,
        positions=[],
    )
    tracks.append(new_track)
    next_track_id += 1
    return new_track


@app.get("/tracks", response_model=List[Track])
def list_tracks():
    return tracks


@app.get("/tracks/{track_id}", response_model=Track)
def get_track(track_id: int):
    track = next((t for t in tracks if t.id == track_id), None)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    return track


@app.delete("/tracks/{track_id}")
def delete_track(track_id: int):
    idx = next((i for i, t in enumerate(tracks) if t.id == track_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Track not found")
    tracks.pop(idx)
    return {"deleted": track_id}


@app.post("/tracks/{track_id}/positions", response_model=Track)
def add_position_to_track(track_id: int, payload: TrackPositionAdd):
    track = next((t for t in tracks if t.id == track_id), None)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")

    now = datetime.now().isoformat()
    new_position = TrackPosition(
        position=payload.position, timestamp=now, accuracy=payload.accuracy
    )
    track.positions.append(new_position)
    return track
