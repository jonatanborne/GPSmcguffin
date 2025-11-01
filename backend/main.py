from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime
import math
import sqlite3
import json
import os


app = FastAPI(title="Dogtracks Geofence Kit", version="0.1.0")

# CORS - Tillåt anrop från alla domäner (för development/prototyping)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # I produktion, sätt specifika domäner
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SQLite Database setup
DB_PATH = os.getenv("DB_PATH", "data.db")

def get_db():
    """Hämta databas-anslutning"""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row  # Gör rows accessbara som dicts
    return conn

def init_db():
    """Initialisera databasen med tabeller"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Geofences tabell
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS geofences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            type TEXT NOT NULL,
            center_lat REAL,
            center_lng REAL,
            radius_m REAL,
            vertices_json TEXT,
            created_at TEXT NOT NULL
        )
    """)
    
    # Tracks tabell
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            track_type TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    
    # Track positions tabell
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS track_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id INTEGER NOT NULL,
            position_lat REAL NOT NULL,
            position_lng REAL NOT NULL,
            timestamp TEXT NOT NULL,
            accuracy REAL,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        )
    """)
    
    # Hiding spots tabell
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hiding_spots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id INTEGER NOT NULL,
            position_lat REAL NOT NULL,
            position_lng REAL NOT NULL,
            name TEXT,
            description TEXT,
            created_at TEXT NOT NULL,
            found INTEGER,  -- NULL, 0 (False), eller 1 (True)
            found_at TEXT,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        )
    """)
    
    conn.commit()
    conn.close()

# Initiera databas vid startup
@app.on_event("startup")
def startup_event():
    init_db()


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


class HidingSpotCreate(BaseModel):
    position: LatLng
    name: Optional[str] = None
    description: Optional[str] = None


class HidingSpot(HidingSpotCreate):
    id: int
    track_id: int
    created_at: str
    found: Optional[bool] = None  # None = inte markerat än, True = hittade, False = hittade inte
    found_at: Optional[str] = None  # När det markerades som hittat/ej hittat


# SQLite databas används istället för in-memory storage


@app.get("/ping")
def ping():
    return {"status": "ok"}


@app.post("/geofences", response_model=Geofence)
def create_geofence(payload: GeofenceCreate):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    
    geofence = payload.geofence
    if geofence.type == "circle":
        cursor.execute("""
            INSERT INTO geofences (name, type, center_lat, center_lng, radius_m, vertices_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.name,
            "circle",
            geofence.center.lat,
            geofence.center.lng,
            geofence.radius_m,
            None,
            now
        ))
    else:  # polygon
        vertices_json = json.dumps([{"lat": v.lat, "lng": v.lng} for v in geofence.vertices])
        cursor.execute("""
            INSERT INTO geofences (name, type, center_lat, center_lng, radius_m, vertices_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            payload.name,
            "polygon",
            None,
            None,
            None,
            vertices_json,
            now
        ))
    
    geofence_id = cursor.lastrowid
    conn.commit()
    
    # Hämta tillbaka det skapade geofencet
    cursor.execute("SELECT * FROM geofences WHERE id = ?", (geofence_id,))
    row = cursor.fetchone()
    conn.close()
    
    return row_to_geofence(row)


@app.get("/geofences", response_model=List[Geofence])
def list_geofences():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM geofences ORDER BY id")
    rows = cursor.fetchall()
    conn.close()
    return [row_to_geofence(row) for row in rows]


@app.delete("/geofences/{geofence_id}")
def delete_geofence(geofence_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM geofences WHERE id = ?", (geofence_id,))
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Geofence not found")
    conn.commit()
    conn.close()
    return {"deleted": geofence_id}


def row_to_geofence(row):
    """Konvertera databas-rad till Geofence-objekt"""
    if row["type"] == "circle":
        geofence_shape = CircleGeofence(
            type="circle",
            center=LatLng(lat=row["center_lat"], lng=row["center_lng"]),
            radius_m=row["radius_m"]
        )
    else:  # polygon
        vertices_data = json.loads(row["vertices_json"])
        geofence_shape = PolygonGeofence(
            type="polygon",
            vertices=[LatLng(lat=v["lat"], lng=v["lng"]) for v in vertices_data]
        )
    
    return Geofence(
        id=row["id"],
        name=row["name"],
        geofence=geofence_shape
    )


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
    
    # Hämta alla geofences från databas
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM geofences")
    rows = cursor.fetchall()
    conn.close()
    
    for row in rows:
        g = row_to_geofence(row)
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
    conn = get_db()
    cursor = conn.cursor()
    
    # Räkna befintliga tracks för att ge ett bra default-namn
    cursor.execute("SELECT COUNT(*) as count FROM tracks WHERE track_type = ?", (payload.track_type,))
    count = cursor.fetchone()["count"]
    
    now = datetime.now().isoformat()
    name = payload.name or f"{payload.track_type.capitalize()} Track {count + 1}"
    
    cursor.execute("""
        INSERT INTO tracks (name, track_type, created_at)
        VALUES (?, ?, ?)
    """, (name, payload.track_type, now))
    
    track_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return Track(id=track_id, name=name, track_type=payload.track_type, created_at=now, positions=[])


@app.get("/tracks", response_model=List[Track])
def list_tracks():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tracks ORDER BY id")
    rows = cursor.fetchall()
    conn.close()
    
    tracks = []
    for row in rows:
        track_id = row["id"]
        # Hämta positioner för detta track
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT position_lat, position_lng, timestamp, accuracy
            FROM track_positions
            WHERE track_id = ?
            ORDER BY timestamp
        """, (track_id,))
        position_rows = cursor.fetchall()
        conn.close()
        
        positions = [
            TrackPosition(
                position=LatLng(lat=p["position_lat"], lng=p["position_lng"]),
                timestamp=p["timestamp"],
                accuracy=p["accuracy"]
            )
            for p in position_rows
        ]
        
        tracks.append(Track(
            id=track_id,
            name=row["name"],
            track_type=row["track_type"],
            created_at=row["created_at"],
            positions=positions
        ))
    
    return tracks


@app.get("/tracks/{track_id}", response_model=Track)
def get_track(track_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tracks WHERE id = ?", (track_id,))
    row = cursor.fetchone()
    
    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")
    
    # Hämta positioner
    cursor.execute("""
        SELECT position_lat, position_lng, timestamp, accuracy
        FROM track_positions
        WHERE track_id = ?
        ORDER BY timestamp
    """, (track_id,))
    position_rows = cursor.fetchall()
    conn.close()
    
    positions = [
        TrackPosition(
            position=LatLng(lat=p["position_lat"], lng=p["position_lng"]),
            timestamp=p["timestamp"],
            accuracy=p["accuracy"]
        )
        for p in position_rows
    ]
    
    return Track(
        id=row["id"],
        name=row["name"],
        track_type=row["track_type"],
        created_at=row["created_at"],
        positions=positions
    )


@app.delete("/tracks/{track_id}")
def delete_track(track_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")
    conn.commit()
    conn.close()
    return {"deleted": track_id}


@app.post("/tracks/{track_id}/positions", response_model=Track)
def add_position_to_track(track_id: int, payload: TrackPositionAdd):
    conn = get_db()
    cursor = conn.cursor()
    
    # Kontrollera att track finns
    cursor.execute("SELECT * FROM tracks WHERE id = ?", (track_id,))
    track_row = cursor.fetchone()
    if track_row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")
    
    # Lägg till position
    now = datetime.now().isoformat()
    cursor.execute("""
        INSERT INTO track_positions (track_id, position_lat, position_lng, timestamp, accuracy)
        VALUES (?, ?, ?, ?, ?)
    """, (track_id, payload.position.lat, payload.position.lng, now, payload.accuracy))
    
    conn.commit()
    conn.close()
    
    # Returnera uppdaterat track
    return get_track(track_id)


# Hiding spots endpoints
@app.post("/tracks/{track_id}/hiding-spots", response_model=HidingSpot)
def create_hiding_spot(track_id: int, payload: HidingSpotCreate):
    conn = get_db()
    cursor = conn.cursor()
    
    # Kontrollera att track finns
    cursor.execute("SELECT * FROM tracks WHERE id = ?", (track_id,))
    track = cursor.fetchone()
    if track is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")
    
    # Räkna befintliga hiding spots för default-namn
    cursor.execute("SELECT COUNT(*) as count FROM hiding_spots WHERE track_id = ?", (track_id,))
    count = cursor.fetchone()["count"]
    
    now = datetime.now().isoformat()
    name = payload.name or f"Gömställe {count + 1}"
    
    cursor.execute("""
        INSERT INTO hiding_spots (track_id, position_lat, position_lng, name, description, created_at, found, found_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        track_id,
        payload.position.lat,
        payload.position.lng,
        name,
        payload.description,
        now,
        None,
        None
    ))
    
    spot_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return HidingSpot(
        id=spot_id,
        track_id=track_id,
        position=payload.position,
        name=name,
        description=payload.description,
        created_at=now,
        found=None,
        found_at=None
    )


@app.get("/tracks/{track_id}/hiding-spots", response_model=List[HidingSpot])
def list_hiding_spots(track_id: int):
    conn = get_db()
    cursor = conn.cursor()
    
    # Kontrollera att track finns
    cursor.execute("SELECT * FROM tracks WHERE id = ?", (track_id,))
    track = cursor.fetchone()
    if track is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")
    
    cursor.execute("SELECT * FROM hiding_spots WHERE track_id = ? ORDER BY id", (track_id,))
    rows = cursor.fetchall()
    conn.close()
    
    return [
        HidingSpot(
            id=row["id"],
            track_id=row["track_id"],
            position=LatLng(lat=row["position_lat"], lng=row["position_lng"]),
            name=row["name"],
            description=row["description"],
            created_at=row["created_at"],
            found=bool(row["found"]) if row["found"] is not None else None,
            found_at=row["found_at"]
        )
        for row in rows
    ]


class HidingSpotStatusUpdate(BaseModel):
    found: bool


@app.put("/tracks/{track_id}/hiding-spots/{spot_id}", response_model=HidingSpot)
def update_hiding_spot_status(track_id: int, spot_id: int, payload: HidingSpotStatusUpdate):
    conn = get_db()
    cursor = conn.cursor()
    
    # Kontrollera att track finns
    cursor.execute("SELECT * FROM tracks WHERE id = ?", (track_id,))
    track = cursor.fetchone()
    if track is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")
    
    # Kontrollera att hiding spot finns
    cursor.execute("SELECT * FROM hiding_spots WHERE id = ? AND track_id = ?", (spot_id, track_id))
    spot = cursor.fetchone()
    if spot is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Hiding spot not found")
    
    # Uppdatera status
    now = datetime.now().isoformat()
    cursor.execute("""
        UPDATE hiding_spots
        SET found = ?, found_at = ?
        WHERE id = ? AND track_id = ?
    """, (1 if payload.found else 0, now, spot_id, track_id))
    
    conn.commit()
    
    # Hämta uppdaterat spot
    cursor.execute("SELECT * FROM hiding_spots WHERE id = ?", (spot_id,))
    updated_row = cursor.fetchone()
    conn.close()
    
    return HidingSpot(
        id=updated_row["id"],
        track_id=updated_row["track_id"],
        position=LatLng(lat=updated_row["position_lat"], lng=updated_row["position_lng"]),
        name=updated_row["name"],
        description=updated_row["description"],
        created_at=updated_row["created_at"],
        found=bool(updated_row["found"]) if updated_row["found"] is not None else None,
        found_at=updated_row["found_at"]
    )


@app.delete("/tracks/{track_id}/hiding-spots/{spot_id}")
def delete_hiding_spot(track_id: int, spot_id: int):
    conn = get_db()
    cursor = conn.cursor()
    
    # Kontrollera att track finns
    cursor.execute("SELECT * FROM tracks WHERE id = ?", (track_id,))
    track = cursor.fetchone()
    if track is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")
    
    cursor.execute("DELETE FROM hiding_spots WHERE id = ? AND track_id = ?", (spot_id, track_id))
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Hiding spot not found")
    
    conn.commit()
    conn.close()
    return {"deleted": spot_id}
