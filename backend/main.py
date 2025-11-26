from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Any
from datetime import datetime
import math
import json
import os
import csv
import random
from io import StringIO
import psycopg2
from psycopg2.extras import RealDictCursor


app = FastAPI(title="Dogtracks Geofence Kit", version="0.1.0")

# CORS - Tillåt anrop från alla domäner (för development/prototyping)
# I Railway: tillåt både frontend-domänen och alla Railway-domäner
# Använd regex för att matcha alla Railway-domäner dynamiskt
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|.*\.up\.railway\.app)(:\d+)?",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Postgres Database setup
# Railway skapar automatiskt DATABASE_URL när Postgres är länkad till servicen
# Om Postgres inte är länkad, försök använda publika URL:en eller manuellt satt POSTGRES_URL
# Prioritering: DATABASE_URL (automatisk) -> DATABASE_PUBLIC_URL (publika) -> POSTGRES_URL (manuell)
DATABASE_URL = (
    os.getenv("DATABASE_URL")
    or os.getenv("DATABASE_PUBLIC_URL")
    or os.getenv("POSTGRES_URL")
)
# Ta bort whitespace och nyrader från connection string
if DATABASE_URL:
    DATABASE_URL = DATABASE_URL.strip()

# Namnlistor för automatisk namngivning
SUPERHEROES_AND_ATHLETES = [
    "Batman",
    "Superman",
    "Wonder Woman",
    "Spider-Man",
    "Iron Man",
    "Captain America",
    "Thor",
    "Black Widow",
    "Hulk",
    "Wolverine",
    "Flash",
    "Green Lantern",
    "Aquaman",
    "Black Panther",
    "Doctor Strange",
    "Zelda",
    "Link",
    "Mario",
    "Lara Croft",
    "Master Chief",
    "Messi",
    "Ronaldo",
    "Zlatan",
    "LeBron James",
    "Serena Williams",
    "Usain Bolt",
    "Michael Phelps",
    "Tiger Woods",
    "Roger Federer",
    "Rafael Nadal",
    "Kobe Bryant",
    "Michael Jordan",
    "Cristiano Ronaldo",
    "Lionel Messi",
    "Tom Brady",
    # Ytterligare 20 superhjältar/idrottsstjärnor (totalt 55)
    "Deadpool",
    "Captain Marvel",
    "Storm",
    "Jean Grey",
    "Cyclops",
    "Magneto",
    "Professor X",
    "Gambit",
    "Rogue",
    "Nightcrawler",
    "Colossus",
    "Iceman",
    "Beast",
    "Moon Knight",
    "Daredevil",
    "Punisher",
    "Ghost Rider",
    "Blade",
    "Mo Salah",
    "Kevin De Bruyne",
    # Fler superhjältar
    "She-Hulk",
    "Ant-Man",
    "Wasp",
    "Hawkeye",
    "Black Knight",
    "Scarlet Witch",
    "Vision",
    "War Machine",
    "Falcon",
    "Winter Soldier",
    "Nick Fury",
    "Loki",
    "Thanos",
    "Green Arrow",
    "Catwoman",
    "Joker",
    "Harley Quinn",
    "Robin",
    "Batgirl",
    "Nightwing",
    "Red Hood",
    "Starfire",
    "Raven",
    "Cyborg",
    "Beast Boy",
    "Blue Beetle",
    "Static Shock",
    "Spawn",
    "Hellboy",
    "Invincible",
    "Omni-Man",
    "Homelander",
    # Fler idrottsstjärnor
    "Neymar",
    "Kylian Mbappé",
    "Erling Haaland",
    "Mohamed Salah",
    "Vinicius Junior",
    "Luka Modrić",
    "Karim Benzema",
    "Robert Lewandowski",
    "Harry Kane",
    "Sadio Mané",
    "Kevin Durant",
    "Stephen Curry",
    "Giannis Antetokounmpo",
    "Luka Dončić",
    "Nikola Jokić",
    "Joel Embiid",
    "Novak Djokovic",
    "Carlos Alcaraz",
    "Simone Biles",
    "Katie Ledecky",
    "Caeleb Dressel",
    "Armand Duplantis",
    "Sydney McLaughlin",
    "Eliud Kipchoge",
    "Jakob Ingebrigtsen",
    "Karsten Warholm",
    "Max Verstappen",
    "Lewis Hamilton",
    "Valentino Rossi",
    "Connor McDavid",
    "Alexander Ovechkin",
    "Patrick Mahomes",
    "Aaron Rodgers",
    "Josh Allen",
    "Lamar Jackson",
    "Shohei Ohtani",
    # Filmstjärnor & kända personer
    "Tom Cruise",
    "Brad Pitt",
    "Leonardo DiCaprio",
    "Will Smith",
    "Dwayne Johnson",
    "Robert Downey Jr",
    "Chris Hemsworth",
    "Chris Evans",
    "Scarlett Johansson",
    "Jennifer Lawrence",
    "Margot Robbie",
    "Keanu Reeves",
    "Ryan Reynolds",
    "Hugh Jackman",
    "Morgan Freeman",
    "Denzel Washington",
    "Samuel L Jackson",
    "Tom Hanks",
    "Matt Damon",
    "Christian Bale",
    "Ryan Gosling",
    "Johnny Depp",
    "Harrison Ford",
    "Arnold Schwarzenegger",
    "Sylvester Stallone",
    "Bruce Willis",
    "Vin Diesel",
    "Jason Statham",
    "Jackie Chan",
    "Jet Li",
    "Bruce Lee",
    "Chuck Norris",
    "Jean-Claude Van Damme",
    "Steven Seagal",
    "Clint Eastwood",
]

ANIMALS = [
    "Varg",
    "Björn",
    "Räv",
    "Örn",
    "Havsörn",
    "Lo",
    "Järv",
    "Hare",
    "Älg",
    "Rådjur",
    "Uggla",
    "Falk",
    "Kråka",
    "Ekorre",
    "Mård",
    "Bäver",
    "Utter",
    "Mink",
    "Hermelin",
    "Lodjur",
    "Hund",
    "Katt",
    "Häst",
    "Get",
    "Får",
    # Ytterligare 30 djur (inklusive insekter, fiskar, fåglar, etc.) - totalt 55
    "Gris",
    "Ko",
    "Noshörning",
    "Giraff",
    "Zebra",
    "Lejon",
    "Tiger",
    "Panter",
    "Jaguar",
    "Gepard",
    "Hyena",
    "Schakal",
    "Sengångare",
    "Känguru",
    "Koala",
    "Panda",
    "Surikat",
    "Myra",
    "Bi",
    "Fjäril",
    "Humla",
    "Gräshoppa",
    "Syrsa",
    "Kackerlacka",
    "Torsk",
    "Lax",
    "Gädda",
    "Mört",
    "Asp",
    "Braxen",
]


def get_db():
    """Hämta databas-anslutning"""
    if DATABASE_URL:
        # Postgres - på Railway ska vi alltid använda Postgres
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
        return conn
    else:
        # Fallback till SQLite endast för lokal utveckling (när DATABASE_URL inte är satt)
        import sqlite3

        DB_PATH = os.path.join(os.getcwd(), "data.db")
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn


def get_cursor(conn):
    """Hämta cursor med rätt factory för Postgres eller SQLite"""
    if DATABASE_URL:
        return conn.cursor(cursor_factory=RealDictCursor)
    else:
        return conn.cursor()


def get_last_insert_id(cursor, table_name="id"):
    """Hämta ID från senaste INSERT - fungerar för både Postgres och SQLite"""
    if DATABASE_URL:
        # Postgres: cursor.fetchone() returnerar dict-row
        result = cursor.fetchone()
        return result["id"] if result and cursor.rowcount > 0 else None
    else:
        # SQLite: lastrowid
        return cursor.lastrowid


def execute_query(cursor, query, params=None):
    """Kör query med rätt placeholders för Postgres eller SQLite"""
    if DATABASE_URL:
        # Postgres använder %s - konvertera ? till %s (men bara i SQL, inte i strängar)
        # Enkel lösning: ersätt ? med %s (fungerar för våra queries)
        query = query.replace("?", "%s")
    # SQLite använder ? (ingen ändring behövs)
    if params:
        cursor.execute(query, params)
    else:
        cursor.execute(query)


def get_row_value(row, key):
    """Hämta värde från row - fungerar för både Postgres (dict) och SQLite (tuple/list)"""
    if DATABASE_URL:
        # Postgres: row är en dict
        return row[key]
    else:
        # SQLite: row är en tuple/list, vi behöver index
        # För "name" kolumnen (första kolumnen i SELECT name) använd index 0
        return row[0]


def init_db():
    """Initialisera databasen med tabeller"""
    conn = get_db()
    is_postgres = DATABASE_URL is not None
    cursor = get_cursor(conn)

    # Geofences tabell
    if is_postgres:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS geofences (
                id SERIAL PRIMARY KEY,
                name TEXT,
                type TEXT NOT NULL,
                center_lat DOUBLE PRECISION,
                center_lng DOUBLE PRECISION,
                radius_m DOUBLE PRECISION,
                vertices_json TEXT,
                created_at TEXT NOT NULL
            )
        """)
    else:
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
    if is_postgres:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tracks (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                track_type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                human_track_id INTEGER,
                FOREIGN KEY (human_track_id) REFERENCES tracks(id) ON DELETE CASCADE
            )
        """)
    else:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                track_type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                human_track_id INTEGER,
                FOREIGN KEY (human_track_id) REFERENCES tracks(id) ON DELETE CASCADE
            )
        """)

    # Lägg till kolumn om den inte finns (för migrations av existerande databaser)
    if is_postgres:
        cursor.execute("""
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='tracks' AND column_name='human_track_id'
                ) THEN
                    ALTER TABLE tracks ADD COLUMN human_track_id INTEGER;
                END IF;
            END $$;
        """)
    else:
        try:
            cursor.execute("ALTER TABLE tracks ADD COLUMN human_track_id INTEGER")
        except Exception:
            pass  # Kolumnen finns redan

    # Track positions tabell
    if is_postgres:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS track_positions (
                id SERIAL PRIMARY KEY,
                track_id INTEGER NOT NULL,
                position_lat DOUBLE PRECISION NOT NULL,
                position_lng DOUBLE PRECISION NOT NULL,
                timestamp TEXT NOT NULL,
                accuracy DOUBLE PRECISION,
                verified_status TEXT DEFAULT 'pending',
                corrected_lat DOUBLE PRECISION,
                corrected_lng DOUBLE PRECISION,
                corrected_at TEXT,
                annotation_notes TEXT,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            )
        """)
    else:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS track_positions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id INTEGER NOT NULL,
                position_lat REAL NOT NULL,
                position_lng REAL NOT NULL,
                timestamp TEXT NOT NULL,
                accuracy REAL,
                verified_status TEXT DEFAULT 'pending',
                corrected_lat REAL,
                corrected_lng REAL,
                corrected_at TEXT,
                annotation_notes TEXT,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            )
        """)

    # Hiding spots tabell
    if is_postgres:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hiding_spots (
                id SERIAL PRIMARY KEY,
                track_id INTEGER NOT NULL,
                position_lat DOUBLE PRECISION NOT NULL,
                position_lng DOUBLE PRECISION NOT NULL,
                name TEXT,
                description TEXT,
                created_at TEXT NOT NULL,
                found INTEGER,
                found_at TEXT,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            )
        """)
    else:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hiding_spots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id INTEGER NOT NULL,
                position_lat REAL NOT NULL,
                position_lng REAL NOT NULL,
                name TEXT,
                description TEXT,
                created_at TEXT NOT NULL,
                found INTEGER,
                found_at TEXT,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            )
        """)

    # Lägg till kolumner för annoteringar och korrigeringar om de saknas
    if is_postgres:
        cursor.execute("""
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='track_positions' AND column_name='verified_status'
                ) THEN
                    ALTER TABLE track_positions ADD COLUMN verified_status TEXT DEFAULT 'pending';
                END IF;
            END $$;
        """)
        for column_name in [
            "corrected_lat",
            "corrected_lng",
            "corrected_at",
            "annotation_notes",
        ]:
            col_type = (
                "DOUBLE PRECISION"
                if "lat" in column_name or "lng" in column_name
                else "TEXT"
            )
            cursor.execute(f"""
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='track_positions' AND column_name='{column_name}'
                    ) THEN
                        ALTER TABLE track_positions ADD COLUMN {column_name} {col_type};
                    END IF;
                END $$;
            """)
    else:
        try:
            cursor.execute(
                "ALTER TABLE track_positions ADD COLUMN verified_status TEXT DEFAULT 'pending'"
            )
        except Exception:
            pass
        for column_name in [
            "corrected_lat",
            "corrected_lng",
            "corrected_at",
            "annotation_notes",
        ]:
            try:
                col_type = (
                    "REAL" if "lat" in column_name or "lng" in column_name else "TEXT"
                )
                cursor.execute(
                    f"ALTER TABLE track_positions ADD COLUMN {column_name} {col_type}"
                )
            except Exception:
                pass

    # Säkerställ defaultvärde för verified_status
    cursor.execute("""
        UPDATE track_positions
        SET verified_status = COALESCE(verified_status, 'pending')
        WHERE verified_status IS NULL
    """)

    conn.commit()
    conn.close()


# Initiera databas vid startup (lazy init - försök bara om Postgres är tillgänglig)
@app.on_event("startup")
def startup_event():
    # Databasen initieras när den faktiskt behövs (t.ex. i /ping eller /tracks)
    # Detta gör att appen kan starta även om Postgres inte är tillgänglig direkt vid startup
    # eller om den interna nätverket inte är klart än
    pass


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
    id: Optional[int] = None
    track_id: Optional[int] = None
    position: LatLng
    timestamp: str  # ISO format datetime string
    accuracy: Optional[float] = None  # GPS accuracy in meters
    verified_status: Optional[Literal["pending", "correct", "incorrect"]] = "pending"
    corrected_position: Optional[LatLng] = None
    corrected_at: Optional[str] = None
    annotation_notes: Optional[str] = None


class TrackCreate(BaseModel):
    name: Optional[str] = None
    track_type: Literal["human", "dog"] = "human"
    human_track_id: Optional[int] = None  # För hundspår: vilket människaspår den går


class Track(TrackCreate):
    id: int
    created_at: str
    positions: List[TrackPosition] = []


class TrackPositionAdd(BaseModel):
    position: LatLng
    accuracy: Optional[float] = None


class TrackPositionUpdate(BaseModel):
    verified_status: Optional[Literal["pending", "correct", "incorrect"]] = None
    corrected_position: Optional[LatLng] = None
    clear_correction: bool = False
    annotation_notes: Optional[str] = None


class HidingSpotCreate(BaseModel):
    position: LatLng
    name: Optional[str] = None
    description: Optional[str] = None


class HidingSpot(HidingSpotCreate):
    id: int
    track_id: int
    created_at: str
    found: Optional[bool] = (
        None  # None = inte markerat än, True = hittade, False = hittade inte
    )
    found_at: Optional[str] = None  # När det markerades som hittat/ej hittat


# SQLite databas används istället för in-memory storage


@app.get("/ping")
def ping():
    # Se till att databasen är initierad
    try:
        init_db()
    except Exception:
        pass  # Ignorera fel vid init (tabeller kan redan finnas)
    return {"status": "ok"}


@app.post("/geofences", response_model=Geofence)
def create_geofence(payload: GeofenceCreate):
    conn = get_db()
    cursor = get_cursor(conn)
    now = datetime.now().isoformat()

    geofence = payload.geofence
    is_postgres = DATABASE_URL is not None
    placeholder = "%s" if is_postgres else "?"
    returning = " RETURNING id" if is_postgres else ""

    if geofence.type == "circle":
        query = f"""
            INSERT INTO geofences (name, type, center_lat, center_lng, radius_m, vertices_json, created_at)
            VALUES ({", ".join([placeholder] * 7)}){returning}
        """
        cursor.execute(
            query,
            (
                payload.name,
                "circle",
                geofence.center.lat,
                geofence.center.lng,
                geofence.radius_m,
                None,
                now,
            ),
        )
    else:  # polygon
        vertices_json = json.dumps(
            [{"lat": v.lat, "lng": v.lng} for v in geofence.vertices]
        )
        query = f"""
            INSERT INTO geofences (name, type, center_lat, center_lng, radius_m, vertices_json, created_at)
            VALUES ({", ".join([placeholder] * 7)}){returning}
        """
        cursor.execute(
            query,
            (payload.name, "polygon", None, None, None, vertices_json, now),
        )

    if is_postgres:
        result = cursor.fetchone()
        geofence_id = result["id"] if result else None
    else:
        geofence_id = cursor.lastrowid
    conn.commit()

    # Hämta tillbaka det skapade geofencet
    placeholder = "%s" if DATABASE_URL else "?"
    cursor.execute(f"SELECT * FROM geofences WHERE id = {placeholder}", (geofence_id,))
    row = cursor.fetchone()
    conn.close()

    return row_to_geofence(row)


@app.get("/geofences", response_model=List[Geofence])
def list_geofences():
    conn = get_db()
    cursor = get_cursor(conn)
    execute_query(cursor, "SELECT * FROM geofences ORDER BY id")
    rows = cursor.fetchall()
    conn.close()
    return [row_to_geofence(row) for row in rows]


@app.delete("/geofences/{geofence_id}")
def delete_geofence(geofence_id: int):
    conn = get_db()
    cursor = get_cursor(conn)
    placeholder = "%s" if DATABASE_URL else "?"
    execute_query(
        cursor, f"DELETE FROM geofences WHERE id = {placeholder}", (geofence_id,)
    )
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
            radius_m=row["radius_m"],
        )
    else:  # polygon
        vertices_data = json.loads(row["vertices_json"])
        geofence_shape = PolygonGeofence(
            type="polygon",
            vertices=[LatLng(lat=v["lat"], lng=v["lng"]) for v in vertices_data],
        )

    return Geofence(id=row["id"], name=row["name"], geofence=geofence_shape)


def row_to_track_position(row):
    """Konvertera databas-rad till TrackPosition-objekt"""
    corrected_position = None
    if row["corrected_lat"] is not None and row["corrected_lng"] is not None:
        corrected_position = LatLng(
            lat=row["corrected_lat"],
            lng=row["corrected_lng"],
        )

    verified_status = row["verified_status"] if row["verified_status"] else "pending"

    return TrackPosition(
        id=row["id"],
        track_id=row["track_id"] if "track_id" in row.keys() else None,
        position=LatLng(lat=row["position_lat"], lng=row["position_lng"]),
        timestamp=row["timestamp"],
        accuracy=row["accuracy"],
        verified_status=verified_status,
        corrected_position=corrected_position,
        corrected_at=row["corrected_at"],
        annotation_notes=row["annotation_notes"],
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
    cursor = get_cursor(conn)
    execute_query(cursor, "SELECT * FROM geofences")
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
    try:
        # Se till att databasen är initierad
        init_db()

        conn = get_db()
        cursor = get_cursor(conn)
        is_postgres = DATABASE_URL is not None
        placeholder = "%s" if is_postgres else "?"

        now = datetime.now().isoformat()

        # Automatisk namngivning
        if payload.name:
            # Använd det angivna namnet
            name = payload.name
        elif payload.track_type == "human":
            # Människospår: välj från superhjältar/idrottsstjärnor
            # Hämta alla befintliga namn för att undvika dubbletter
            execute_query(cursor, "SELECT name FROM tracks WHERE track_type = 'human'")
            existing_names = {get_row_value(row, "name") for row in cursor.fetchall()}

            # Välj ett namn som inte redan används
            available_names = [
                n for n in SUPERHEROES_AND_ATHLETES if n not in existing_names
            ]
            if available_names:
                name = random.choice(available_names)
            else:
                # Om alla namn är använda, lägg till nummer
                name = f"{random.choice(SUPERHEROES_AND_ATHLETES)} {len(existing_names) + 1}"
        elif payload.track_type == "dog" and payload.human_track_id:
            # Hundspår kopplat till människospår: "batmans hund" eller "batman hund"
            execute_query(
                cursor,
                f"SELECT name FROM tracks WHERE id = {placeholder}",
                (payload.human_track_id,),
            )
            human_track = cursor.fetchone()
            if human_track:
                human_name = get_row_value(human_track, "name")
                # Lägg till "s hund" om namnet inte slutar på s, annars bara " hund"
                if human_name.lower().endswith("s"):
                    name = f"{human_name} hund"
                else:
                    name = f"{human_name}s hund"
            else:
                # Om människospåret inte hittas, använd djur (separata hundspår)
                execute_query(
                    cursor,
                    "SELECT name FROM tracks WHERE track_type = 'dog' AND human_track_id IS NULL",
                )
                existing_names = {
                    get_row_value(row, "name") for row in cursor.fetchall()
                }
                available_names = [n for n in ANIMALS if n not in existing_names]
                name = (
                    random.choice(available_names)
                    if available_names
                    else f"{random.choice(ANIMALS)} {len(existing_names) + 1}"
                )
        else:
            # Hundspår utan koppling: välj från djur
            # Hämta bara separata hundspår (utan human_track_id)
            execute_query(
                cursor,
                "SELECT name FROM tracks WHERE track_type = 'dog' AND human_track_id IS NULL",
            )
            existing_names = {get_row_value(row, "name") for row in cursor.fetchall()}
            available_names = [n for n in ANIMALS if n not in existing_names]
            if available_names:
                name = random.choice(available_names)
            else:
                name = f"{random.choice(ANIMALS)} {len(existing_names) + 1}"

        returning = " RETURNING id" if is_postgres else ""
        execute_query(
            cursor,
            f"""
            INSERT INTO tracks (name, track_type, created_at, human_track_id)
            VALUES ({", ".join([placeholder] * 4)}){returning}
        """,
            (name, payload.track_type, now, payload.human_track_id),
        )

        if is_postgres:
            result = cursor.fetchone()
            track_id = result["id"] if result else None
        else:
            track_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return Track(
            id=track_id,
            name=name,
            track_type=payload.track_type,
            created_at=now,
            positions=[],
            human_track_id=payload.human_track_id,
        )
    except Exception as e:
        import traceback

        error_details = traceback.format_exc()
        print(f"Error creating track: {error_details}")
        raise HTTPException(status_code=500, detail=f"Kunde inte skapa track: {str(e)}")


@app.get("/tracks", response_model=List[Track])
def list_tracks():
    conn = get_db()
    cursor = get_cursor(conn)
    execute_query(cursor, "SELECT * FROM tracks ORDER BY id")
    rows = cursor.fetchall()
    conn.close()

    tracks = []
    for row in rows:
        track_id = row["id"]
        # Hämta positioner för detta track
        conn2 = get_db()
        cursor2 = get_cursor(conn2)
        placeholder = "%s" if DATABASE_URL else "?"
        execute_query(
            cursor2,
            f"""
            SELECT
                id,
                track_id,
                position_lat,
                position_lng,
                timestamp,
                accuracy,
                verified_status,
                corrected_lat,
                corrected_lng,
                corrected_at,
                annotation_notes
            FROM track_positions
            WHERE track_id = {placeholder}
            ORDER BY timestamp
        """,
            (track_id,),
        )
        position_rows = cursor2.fetchall()
        conn2.close()

        positions = [row_to_track_position(p) for p in position_rows]

        tracks.append(
            Track(
                id=track_id,
                name=row["name"],
                track_type=row["track_type"],
                created_at=row["created_at"],
                positions=positions,
                human_track_id=row["human_track_id"]
                if "human_track_id" in row.keys()
                else None,
            )
        )

    return tracks


@app.post("/tracks/rename-generic")
def rename_generic_tracks():
    """
    Uppdatera befintliga spår med generiska namn (t.ex. "Människospår 1", "Hundspår 2")
    till unika namn baserat på deras track_type.
    """
    conn = get_db()
    cursor = get_cursor(conn)
    placeholder = "%s" if DATABASE_URL else "?"

    # Hämta alla tracks för att kontrollera vilka som har generiska namn
    execute_query(
        cursor, "SELECT id, name, track_type, human_track_id FROM tracks ORDER BY id"
    )
    all_tracks = cursor.fetchall()

    # Kontrollera vilka tracks som har generiska namn
    # Generiska namn innehåller "Track", "Människospår", "Hundspår", "MÃ¤nniska", datum/tid, etc.
    generic_tracks = []
    for track in all_tracks:
        name = track["name"]
        # Kontrollera om namnet är generiskt
        is_generic = (
            "Track" in name
            or "track" in name
            or "Människospår" in name
            or "Hundspår" in name
            or "MÃ¤nniska" in name
            or "Människa" in name
            or "Dog" in name
            or "dog" in name
            or "Hund" in name
            or
            # Om namnet innehåller datum/tid-format (t.ex. "12:44:46" eller "- 12:44")
            (":" in name and any(char.isdigit() for char in name))
        )

        # Om namnet inte är från våra listor med superhjältar/idrottsstjärnor eller djur
        # och inte slutar med "hund" (för kopplade hundspår), så är det generiskt
        if track["track_type"] == "human":
            if not any(hero in name for hero in SUPERHEROES_AND_ATHLETES):
                is_generic = True
        elif track["track_type"] == "dog" and not track.get("human_track_id"):
            # Separata hundspår
            if not any(animal in name for animal in ANIMALS):
                is_generic = True

        if is_generic:
            generic_tracks.append(track)

    if not generic_tracks:
        conn.close()
        return {"message": "Inga spår med generiska namn hittades", "updated": 0}

    updated_count = 0
    updated_tracks = []

    for track in generic_tracks:
        track_id = track["id"]
        track_type = track["track_type"]
        human_track_id = track.get("human_track_id")

        # Generera nytt namn baserat på track_type
        if track_type == "human":
            # Hämta alla befintliga namn för människospår (exkludera det nuvarande spåret)
            execute_query(
                cursor,
                f"SELECT name FROM tracks WHERE track_type = 'human' AND id != {placeholder}",
                (track_id,),
            )
            existing_names = {get_row_value(row, "name") for row in cursor.fetchall()}

            # Välj ett namn som inte redan används
            available_names = [
                n for n in SUPERHEROES_AND_ATHLETES if n not in existing_names
            ]
            if available_names:
                new_name = random.choice(available_names)
            else:
                # Om alla namn är använda, lägg till nummer
                counter = 1
                while True:
                    base_name = random.choice(SUPERHEROES_AND_ATHLETES)
                    new_name = f"{base_name} {counter}"
                    if new_name not in existing_names:
                        break
                    counter += 1
        elif track_type == "dog" and human_track_id:
            # Hundspår kopplat till människospår
            execute_query(
                cursor,
                f"SELECT name FROM tracks WHERE id = {placeholder}",
                (human_track_id,),
            )
            human_track = cursor.fetchone()
            if human_track:
                human_name = get_row_value(human_track, "name")
                if human_name.lower().endswith("s"):
                    new_name = f"{human_name} hund"
                else:
                    new_name = f"{human_name}s hund"
            else:
                # Om människospåret inte hittas, använd djur (exkludera det nuvarande spåret)
                execute_query(
                    cursor,
                    f"SELECT name FROM tracks WHERE track_type = 'dog' AND human_track_id IS NULL AND id != {placeholder}",
                    (track_id,),
                )
                existing_names = {
                    get_row_value(row, "name") for row in cursor.fetchall()
                }
                available_names = [n for n in ANIMALS if n not in existing_names]
                if available_names:
                    new_name = random.choice(available_names)
                else:
                    counter = 1
                    while True:
                        base_name = random.choice(ANIMALS)
                        new_name = f"{base_name} {counter}"
                        if new_name not in existing_names:
                            break
                        counter += 1
        else:
            # Separata hundspår (exkludera det nuvarande spåret)
            execute_query(
                cursor,
                f"SELECT name FROM tracks WHERE track_type = 'dog' AND human_track_id IS NULL AND id != {placeholder}",
                (track_id,),
            )
            existing_names = {get_row_value(row, "name") for row in cursor.fetchall()}
            available_names = [n for n in ANIMALS if n not in existing_names]
            if available_names:
                new_name = random.choice(available_names)
            else:
                counter = 1
                while True:
                    base_name = random.choice(ANIMALS)
                    new_name = f"{base_name} {counter}"
                    if new_name not in existing_names:
                        break
                    counter += 1

        # Uppdatera namnet
        execute_query(
            cursor,
            f"UPDATE tracks SET name = {placeholder} WHERE id = {placeholder}",
            (new_name, track_id),
        )
        updated_count += 1
        updated_tracks.append(
            {"id": track_id, "old_name": track["name"], "new_name": new_name}
        )

    conn.commit()
    conn.close()

    return {
        "message": f"Uppdaterade {updated_count} spår",
        "updated": updated_count,
        "tracks": updated_tracks,
    }


@app.post("/tracks/rename-generic")
def rename_generic_tracks_endpoint():
    """
    API-endpoint för att döpa om spår med generiska namn till unika namn
    """
    return rename_generic_tracks()


@app.get("/tracks/{track_id}", response_model=Track)
def get_track(track_id: int):
    conn = get_db()
    cursor = get_cursor(conn)
    placeholder = "%s" if DATABASE_URL else "?"
    execute_query(cursor, f"SELECT * FROM tracks WHERE id = {placeholder}", (track_id,))
    row = cursor.fetchone()

    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")

    # Hämta positioner
    execute_query(
        cursor,
        f"""
        SELECT
            id,
            track_id,
            position_lat,
            position_lng,
            timestamp,
            accuracy,
            verified_status,
            corrected_lat,
            corrected_lng,
            corrected_at,
            annotation_notes
        FROM track_positions
        WHERE track_id = {placeholder}
        ORDER BY timestamp
    """,
        (track_id,),
    )
    position_rows = cursor.fetchall()
    conn.close()

    positions = [row_to_track_position(p) for p in position_rows]

    return Track(
        id=row["id"],
        name=row["name"],
        track_type=row["track_type"],
        created_at=row["created_at"],
        positions=positions,
        human_track_id=row["human_track_id"]
        if "human_track_id" in row.keys()
        else None,
    )


@app.delete("/tracks/{track_id}")
def delete_track(track_id: int):
    conn = get_db()
    cursor = get_cursor(conn)
    placeholder = "%s" if DATABASE_URL else "?"
    execute_query(cursor, f"DELETE FROM tracks WHERE id = {placeholder}", (track_id,))
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")
    conn.commit()
    conn.close()
    return {"deleted": track_id}


@app.get("/tracks/{track_id}/compare")
def compare_tracks(track_id: int):
    """Jämför ett hundspår med sitt människaspår och returnera statistik"""
    conn = get_db()
    cursor = get_cursor(conn)

    # Hämta hundens track
    placeholder = "%s" if DATABASE_URL else "?"
    execute_query(cursor, f"SELECT * FROM tracks WHERE id = {placeholder}", (track_id,))
    dog_track_row = cursor.fetchone()
    if dog_track_row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")

    # Kontrollera att det är ett hundspår
    if dog_track_row["track_type"] != "dog":
        conn.close()
        raise HTTPException(status_code=400, detail="Track must be a dog track")

    # Hämta människans track
    human_track_id = (
        dog_track_row["human_track_id"]
        if "human_track_id" in dog_track_row.keys()
        else None
    )
    if not human_track_id:
        conn.close()
        raise HTTPException(
            status_code=400, detail="Dog track has no associated human track"
        )

    execute_query(
        cursor, f"SELECT * FROM tracks WHERE id = {placeholder}", (human_track_id,)
    )
    human_track_row = cursor.fetchone()
    if human_track_row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Human track not found")

    # Hämta hundens positioner
    execute_query(
        cursor,
        f"""
        SELECT position_lat, position_lng, timestamp
        FROM track_positions
        WHERE track_id = {placeholder}
        ORDER BY timestamp
    """,
        (track_id,),
    )
    dog_positions = cursor.fetchall()

    # Hämta människans positioner
    execute_query(
        cursor,
        f"""
        SELECT position_lat, position_lng, timestamp
        FROM track_positions
        WHERE track_id = {placeholder}
        ORDER BY timestamp
    """,
        (human_track_id,),
    )
    human_positions = cursor.fetchall()

    # Hämta hiding spots och deras status
    execute_query(
        cursor,
        f"""
        SELECT id, position_lat, position_lng, found
        FROM hiding_spots
        WHERE track_id = {placeholder}
    """,
        (human_track_id,),
    )
    hiding_spots = cursor.fetchall()

    conn.close()

    # Beräkna avståndsstatistik
    # Förbättrad algoritm: matcha varje människposition med närmaste hundposition
    # baserat på geografiskt avstånd (inte bara tidsstämplar)
    # Detta hanterar bättre när hundens spår är förskjutet i tid eller har annan hastighet

    distances = []
    unmatched_human_positions = 0

    for hp in human_positions:
        human_pos = LatLng(lat=hp["position_lat"], lng=hp["position_lng"])

        # Hitta närmaste hundposition baserat på geografiskt avstånd
        min_distance = float("inf")
        for dp in dog_positions:
            dog_pos = LatLng(lat=dp["position_lat"], lng=dp["position_lng"])
            dist = haversine_meters(human_pos, dog_pos)
            if dist < min_distance:
                min_distance = dist

        # Om närmaste hundposition är för långt bort (>200m), räkna som omatchad
        # Annars lägg till avståndet
        if min_distance <= 200:
            distances.append(min_distance)
        else:
            unmatched_human_positions += 1
            # Räkna stora avvikelser som 200m för att straffa omatchade positioner
            distances.append(200.0)

    # Beräkna statistik
    avg_distance = sum(distances) / len(distances) if distances else 0
    max_distance = max(distances) if distances else 0

    # Beräkna procentuell matchning
    # 0-10m = 100%, 10-50m = 90-50%, 50-100m = 50-0%, >100m = 0%
    if avg_distance <= 10:
        match_percentage = 100 - (avg_distance * 2)  # 0-10m: 100-80%
    elif avg_distance <= 50:
        match_percentage = 80 - ((avg_distance - 10) * 1.5)  # 10-50m: 80-20%
    elif avg_distance <= 100:
        match_percentage = 20 - ((avg_distance - 50) * 0.4)  # 50-100m: 20-0%
    else:
        match_percentage = 0

    match_percentage = max(0, min(100, match_percentage))

    # Räkna hiding spots statistik
    total_spots = len(hiding_spots)
    found_spots = sum(1 for spot in hiding_spots if spot["found"] is True)
    missed_spots = sum(1 for spot in hiding_spots if spot["found"] is False)
    unchecked_spots = total_spots - found_spots - missed_spots

    return {
        "human_track": {
            "id": human_track_row["id"],
            "name": human_track_row["name"],
            "created_at": human_track_row["created_at"],
            "position_count": len(human_positions),
        },
        "dog_track": {
            "id": dog_track_row["id"],
            "name": dog_track_row["name"],
            "created_at": dog_track_row["created_at"],
            "position_count": len(dog_positions),
        },
        "distance_stats": {
            "average_meters": round(avg_distance, 2),
            "max_meters": round(max_distance, 2),
        },
        "match_percentage": round(match_percentage, 1),
        "hiding_spots": {
            "total": total_spots,
            "found": found_spots,
            "missed": missed_spots,
            "unchecked": unchecked_spots,
        },
    }


@app.get("/tracks/compare")
def compare_tracks_custom(human_track_id: int, dog_track_id: int):
    """Jämför ett valt människaspår med ett valt hundspår och returnera statistik"""
    conn = get_db()
    cursor = get_cursor(conn)

    # Hämta människans track
    placeholder = "%s" if DATABASE_URL else "?"
    execute_query(
        cursor, f"SELECT * FROM tracks WHERE id = {placeholder}", (human_track_id,)
    )
    human_track_row = cursor.fetchone()
    if human_track_row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Human track not found")

    # Kontrollera att det är ett människaspår
    if human_track_row["track_type"] != "human":
        conn.close()
        raise HTTPException(status_code=400, detail="First track must be a human track")

    # Hämta hundens track
    execute_query(
        cursor, f"SELECT * FROM tracks WHERE id = {placeholder}", (dog_track_id,)
    )
    dog_track_row = cursor.fetchone()
    if dog_track_row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Dog track not found")

    # Kontrollera att det är ett hundspår
    if dog_track_row["track_type"] != "dog":
        conn.close()
        raise HTTPException(status_code=400, detail="Second track must be a dog track")

    # Hämta människans positioner
    execute_query(
        cursor,
        f"""
        SELECT position_lat, position_lng, timestamp
        FROM track_positions
        WHERE track_id = {placeholder}
        ORDER BY timestamp
    """,
        (human_track_id,),
    )
    human_positions = cursor.fetchall()

    # Hämta hundens positioner
    execute_query(
        cursor,
        f"""
        SELECT position_lat, position_lng, timestamp
        FROM track_positions
        WHERE track_id = {placeholder}
        ORDER BY timestamp
    """,
        (dog_track_id,),
    )
    dog_positions = cursor.fetchall()

    # Hämta hiding spots från människans track
    execute_query(
        cursor,
        f"""
        SELECT id, position_lat, position_lng, found
        FROM hiding_spots
        WHERE track_id = {placeholder}
    """,
        (human_track_id,),
    )
    hiding_spots = cursor.fetchall()

    conn.close()

    # Beräkna avståndsstatistik
    # Förbättrad algoritm: matcha varje människposition med närmaste hundposition
    # baserat på geografiskt avstånd (inte bara tidsstämplar)
    # Detta hanterar bättre när hundens spår är förskjutet i tid eller har annan hastighet

    distances = []
    unmatched_human_positions = 0

    for hp in human_positions:
        human_pos = LatLng(lat=hp["position_lat"], lng=hp["position_lng"])

        # Hitta närmaste hundposition baserat på geografiskt avstånd
        min_distance = float("inf")
        for dp in dog_positions:
            dog_pos = LatLng(lat=dp["position_lat"], lng=dp["position_lng"])
            dist = haversine_meters(human_pos, dog_pos)
            if dist < min_distance:
                min_distance = dist

        # Om närmaste hundposition är för långt bort (>200m), räkna som omatchad
        # Annars lägg till avståndet
        if min_distance <= 200:
            distances.append(min_distance)
        else:
            unmatched_human_positions += 1
            # Räkna stora avvikelser som 200m för att straffa omatchade positioner
            distances.append(200.0)

    # Beräkna statistik
    avg_distance = sum(distances) / len(distances) if distances else 0
    max_distance = max(distances) if distances else 0

    # Beräkna procentuell matchning
    # 0-10m = 100%, 10-50m = 90-50%, 50-100m = 50-0%, >100m = 0%
    if avg_distance <= 10:
        match_percentage = 100 - (avg_distance * 2)  # 0-10m: 100-80%
    elif avg_distance <= 50:
        match_percentage = 80 - ((avg_distance - 10) * 1.5)  # 10-50m: 80-20%
    elif avg_distance <= 100:
        match_percentage = 20 - ((avg_distance - 50) * 0.4)  # 50-100m: 20-0%
    else:
        match_percentage = 0

    match_percentage = max(0, min(100, match_percentage))

    # Räkna hiding spots statistik
    total_spots = len(hiding_spots)
    found_spots = sum(1 for spot in hiding_spots if spot["found"] is True)
    missed_spots = sum(1 for spot in hiding_spots if spot["found"] is False)
    unchecked_spots = total_spots - found_spots - missed_spots

    return {
        "human_track": {
            "id": human_track_row["id"],
            "name": human_track_row["name"],
            "created_at": human_track_row["created_at"],
            "position_count": len(human_positions),
        },
        "dog_track": {
            "id": dog_track_row["id"],
            "name": dog_track_row["name"],
            "created_at": dog_track_row["created_at"],
            "position_count": len(dog_positions),
        },
        "distance_stats": {
            "average_meters": round(avg_distance, 2),
            "max_meters": round(max_distance, 2),
        },
        "match_percentage": round(match_percentage, 1),
        "hiding_spots": {
            "total": total_spots,
            "found": found_spots,
            "missed": missed_spots,
            "unchecked": unchecked_spots,
        },
    }


@app.post("/tracks/{track_id}/positions", response_model=Track)
def add_position_to_track(track_id: int, payload: TrackPositionAdd):
    conn = get_db()
    cursor = get_cursor(conn)
    is_postgres = DATABASE_URL is not None
    placeholder = "%s" if is_postgres else "?"

    # Kontrollera att track finns
    execute_query(cursor, f"SELECT * FROM tracks WHERE id = {placeholder}", (track_id,))
    track_row = cursor.fetchone()
    if track_row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")

    # Lägg till position
    now = datetime.now().isoformat()
    returning = " RETURNING id" if is_postgres else ""
    execute_query(
        cursor,
        f"""
        INSERT INTO track_positions (track_id, position_lat, position_lng, timestamp, accuracy)
        VALUES ({", ".join([placeholder] * 5)}){returning}
    """,
        (track_id, payload.position.lat, payload.position.lng, now, payload.accuracy),
    )

    conn.commit()
    conn.close()

    # Returnera uppdaterat track
    return get_track(track_id)


@app.put("/track-positions/{position_id}", response_model=TrackPosition)
def update_track_position(position_id: int, payload: TrackPositionUpdate):
    conn = get_db()
    cursor = get_cursor(conn)
    placeholder = "%s" if DATABASE_URL else "?"
    execute_query(
        cursor,
        f"SELECT * FROM track_positions WHERE id = {placeholder}",
        (position_id,),
    )
    row = cursor.fetchone()

    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track position not found")

    update_fields = []
    params: List[Any] = []

    if payload.verified_status is not None:
        update_fields.append(f"verified_status = {placeholder}")
        params.append(payload.verified_status)

    if payload.corrected_position is not None:
        update_fields.extend(
            [
                f"corrected_lat = {placeholder}",
                f"corrected_lng = {placeholder}",
                f"corrected_at = {placeholder}",
            ]
        )
        params.extend(
            [
                payload.corrected_position.lat,
                payload.corrected_position.lng,
                datetime.now().isoformat(),
            ]
        )
    elif payload.clear_correction:
        update_fields.append("corrected_lat = NULL")
        update_fields.append("corrected_lng = NULL")
        update_fields.append("corrected_at = NULL")

    if payload.annotation_notes is not None:
        if payload.annotation_notes == "":
            update_fields.append("annotation_notes = NULL")
        else:
            update_fields.append(f"annotation_notes = {placeholder}")
            params.append(payload.annotation_notes)

    if not update_fields:
        conn.close()
        return row_to_track_position(row)

    params.append(position_id)
    execute_query(
        cursor,
        f"UPDATE track_positions SET {', '.join(update_fields)} WHERE id = {placeholder}",
        params,
    )

    conn.commit()
    execute_query(
        cursor,
        f"SELECT * FROM track_positions WHERE id = {placeholder}",
        (position_id,),
    )
    updated_row = cursor.fetchone()
    conn.close()

    return row_to_track_position(updated_row)


def fetch_track_positions(
    track_id: Optional[int] = None,
    verified_status: Optional[Literal["pending", "correct", "incorrect"]] = None,
    include_uncorrected: bool = True,
):
    conn = get_db()
    cursor = get_cursor(conn)

    query = """
        SELECT
            id,
            track_id,
            position_lat,
            position_lng,
            timestamp,
            accuracy,
            verified_status,
            corrected_lat,
            corrected_lng,
            corrected_at,
            annotation_notes
        FROM track_positions
    """
    conditions = []
    params: List[Any] = []

    placeholder = "%s" if DATABASE_URL else "?"

    if track_id is not None:
        conditions.append(f"track_id = {placeholder}")
        params.append(track_id)

    if verified_status is not None:
        conditions.append(f"verified_status = {placeholder}")
        params.append(verified_status)

    if not include_uncorrected:
        conditions.append("corrected_lat IS NOT NULL AND corrected_lng IS NOT NULL")

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY timestamp"

    execute_query(cursor, query, params)
    rows = cursor.fetchall()
    conn.close()

    return rows


@app.get("/track-positions", response_model=List[TrackPosition])
def list_track_positions(
    track_id: Optional[int] = None,
    verified_status: Optional[Literal["pending", "correct", "incorrect"]] = None,
    include_uncorrected: bool = True,
):
    rows = fetch_track_positions(track_id, verified_status, include_uncorrected)
    return [row_to_track_position(row) for row in rows]


@app.get("/track-positions/export")
def export_track_positions(
    track_id: Optional[int] = None,
    verified_status: Optional[Literal["pending", "correct", "incorrect"]] = None,
    include_uncorrected: bool = True,
):
    rows = fetch_track_positions(track_id, verified_status, include_uncorrected)

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "track_id",
            "timestamp",
            "position_lat",
            "position_lng",
            "accuracy",
            "verified_status",
            "corrected_lat",
            "corrected_lng",
            "corrected_at",
            "annotation_notes",
        ]
    )

    for row in rows:
        writer.writerow(
            [
                row["id"],
                row["track_id"],
                row["timestamp"],
                row["position_lat"],
                row["position_lng"],
                row["accuracy"],
                row["verified_status"],
                row["corrected_lat"],
                row["corrected_lng"],
                row["corrected_at"],
                row["annotation_notes"] or "",
            ]
        )

    output.seek(0)
    filename = "track_positions.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# Hiding spots endpoints
@app.post("/tracks/{track_id}/hiding-spots", response_model=HidingSpot)
def create_hiding_spot(track_id: int, payload: HidingSpotCreate):
    conn = get_db()
    cursor = get_cursor(conn)

    # Kontrollera att track finns
    placeholder = "%s" if DATABASE_URL else "?"
    execute_query(cursor, f"SELECT * FROM tracks WHERE id = {placeholder}", (track_id,))
    track = cursor.fetchone()
    if track is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")

    # Räkna befintliga hiding spots för default-namn
    execute_query(
        cursor,
        f"SELECT COUNT(*) as count FROM hiding_spots WHERE track_id = {placeholder}",
        (track_id,),
    )
    count = cursor.fetchone()["count"]

    now = datetime.now().isoformat()
    name = payload.name or f"Gömställe {count + 1}"

    is_postgres = DATABASE_URL is not None
    returning = " RETURNING id" if is_postgres else ""
    execute_query(
        cursor,
        f"""
        INSERT INTO hiding_spots (track_id, position_lat, position_lng, name, description, created_at, found, found_at)
        VALUES ({", ".join([placeholder] * 8)}){returning}
    """,
        (
            track_id,
            payload.position.lat,
            payload.position.lng,
            name,
            payload.description,
            now,
            None,
            None,
        ),
    )

    if is_postgres:
        result = cursor.fetchone()
        spot_id = result["id"] if result else None
    else:
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
        found_at=None,
    )


@app.get("/tracks/{track_id}/hiding-spots", response_model=List[HidingSpot])
def list_hiding_spots(track_id: int):
    conn = get_db()
    cursor = get_cursor(conn)

    # Kontrollera att track finns
    placeholder = "%s" if DATABASE_URL else "?"
    execute_query(cursor, f"SELECT * FROM tracks WHERE id = {placeholder}", (track_id,))
    track = cursor.fetchone()
    if track is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")

    execute_query(
        cursor,
        f"SELECT * FROM hiding_spots WHERE track_id = {placeholder} ORDER BY id",
        (track_id,),
    )
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
            found_at=row["found_at"],
        )
        for row in rows
    ]


class HidingSpotStatusUpdate(BaseModel):
    found: bool


@app.put("/tracks/{track_id}/hiding-spots/{spot_id}", response_model=HidingSpot)
def update_hiding_spot_status(
    track_id: int, spot_id: int, payload: HidingSpotStatusUpdate
):
    conn = get_db()
    cursor = get_cursor(conn)

    # Kontrollera att track finns
    placeholder = "%s" if DATABASE_URL else "?"
    execute_query(cursor, f"SELECT * FROM tracks WHERE id = {placeholder}", (track_id,))
    track = cursor.fetchone()
    if track is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")

    # Kontrollera att hiding spot finns
    execute_query(
        cursor,
        f"SELECT * FROM hiding_spots WHERE id = {placeholder} AND track_id = {placeholder}",
        (spot_id, track_id),
    )
    spot = cursor.fetchone()
    if spot is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Hiding spot not found")

    # Uppdatera status
    now = datetime.now().isoformat()
    execute_query(
        cursor,
        f"""
        UPDATE hiding_spots
        SET found = {placeholder}, found_at = {placeholder}
        WHERE id = {placeholder} AND track_id = {placeholder}
    """,
        (1 if payload.found else 0, now, spot_id, track_id),
    )

    conn.commit()

    # Hämta uppdaterat spot
    execute_query(
        cursor, f"SELECT * FROM hiding_spots WHERE id = {placeholder}", (spot_id,)
    )
    updated_row = cursor.fetchone()
    conn.close()

    return HidingSpot(
        id=updated_row["id"],
        track_id=updated_row["track_id"],
        position=LatLng(
            lat=updated_row["position_lat"], lng=updated_row["position_lng"]
        ),
        name=updated_row["name"],
        description=updated_row["description"],
        created_at=updated_row["created_at"],
        found=bool(updated_row["found"]) if updated_row["found"] is not None else None,
        found_at=updated_row["found_at"],
    )


@app.delete("/tracks/{track_id}/hiding-spots/{spot_id}")
def delete_hiding_spot(track_id: int, spot_id: int):
    conn = get_db()
    cursor = get_cursor(conn)

    # Kontrollera att track finns
    placeholder = "%s" if DATABASE_URL else "?"
    execute_query(cursor, f"SELECT * FROM tracks WHERE id = {placeholder}", (track_id,))
    track = cursor.fetchone()
    if track is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")

    execute_query(
        cursor,
        f"DELETE FROM hiding_spots WHERE id = {placeholder} AND track_id = {placeholder}",
        (spot_id, track_id),
    )
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Hiding spot not found")

    conn.commit()
    conn.close()
    return {"deleted": spot_id}


# Tile converter endpoints
class TileConvertRequest(BaseModel):
    bounds: List[float] = Field(
        ..., min_length=4, max_length=4
    )  # [min_lat, min_lon, max_lat, max_lon]
    zoom_levels: List[int] = Field(..., min_items=1)
    server: Literal["osm", "esri_street", "esri_satellite"] = "esri_street"
    scale_factor: int = Field(2, ge=1, le=4)


# Statisk fil-server för tiles
# Spara tiles i backend/tiles så de kan serveras direkt
# Mounta på /static/tiles för att inte krocka med /tiles/convert endpoint
try:
    backend_dir = Path(__file__).parent
    tiles_static_dir = backend_dir / "tiles"
    tiles_static_dir.mkdir(exist_ok=True)

    # Mounta tiles-mappen som statiska filer
    # Tiles kommer vara tillgängliga på /static/tiles/{z}/{x}/{y}.png
    app.mount(
        "/static/tiles", StaticFiles(directory=str(tiles_static_dir)), name="tiles"
    )
except Exception as e:
    print(f"Warning: Could not mount tiles static directory: {e}")


@app.get("/tiles/status")
def get_tiles_status():
    """
    Kontrollera om lokala tiles finns och deras storlek.
    """
    from pathlib import Path

    try:
        from PIL import Image
    except ImportError:
        return {
            "available": False,
            "tile_size": None,
            "zoom_levels": [],
            "message": "PIL/Pillow not installed",
        }

    try:
        backend_dir = Path(__file__).parent
        tiles_dir = backend_dir / "tiles"

        if not tiles_dir.exists():
            return {
                "available": False,
                "tile_size": None,
                "zoom_levels": [],
                "message": "No tiles directory found",
            }

        # Hitta första tile-filen för att bestämma storlek
        tile_size = None
        zoom_levels = []

        # Sök efter zoom-mappar
        try:
            for zoom_dir in tiles_dir.iterdir():
                if zoom_dir.is_dir() and zoom_dir.name.isdigit():
                    zoom_level = int(zoom_dir.name)
                    zoom_levels.append(zoom_level)

                    # Hitta första tile i denna zoom-nivå
                    if tile_size is None:
                        try:
                            for x_dir in zoom_dir.iterdir():
                                if x_dir.is_dir():
                                    for tile_file in x_dir.glob("*.png"):
                                        try:
                                            img = Image.open(tile_file)
                                            tile_size = img.width
                                            break
                                        except Exception:
                                            continue
                                if tile_size is not None:
                                    break
                        except Exception:
                            continue
                    if tile_size is not None:
                        break
        except Exception as e:
            return {
                "available": False,
                "tile_size": None,
                "zoom_levels": [],
                "message": f"Error reading tiles directory: {str(e)}",
            }

        zoom_levels.sort()

        if tile_size is None:
            return {
                "available": False,
                "tile_size": None,
                "zoom_levels": [],
                "message": "Tiles directory exists but no tiles found",
            }

        return {
            "available": True,
            "tile_size": tile_size,
            "zoom_levels": zoom_levels,
            "message": f"Tiles available: {len(zoom_levels)} zoom levels, size {tile_size}x{tile_size}",
        }

    except Exception as e:
        return {
            "available": False,
            "tile_size": None,
            "zoom_levels": [],
            "message": f"Error checking tiles: {str(e)}",
        }


@app.post("/tiles/convert")
def convert_tiles(payload: TileConvertRequest):
    """
    Konvertera och förstora tiles för aktuellt kartområde.
    Anropar tile-konverteringsfunktioner direkt istället för via subprocess.
    """
    import io
    import requests
    from PIL import Image
    from pathlib import Path
    import time

    try:
        # Hämta projektets root directory
        backend_dir = Path(__file__).parent

        # Spara tiles i backend/tiles så de kan serveras som statiska filer
        # Detta fungerar både lokalt och på Railway
        output_dir = backend_dir / "tiles"
        output_dir.mkdir(parents=True, exist_ok=True)

        # Kontrollera att output_dir är skrivbar
        try:
            test_file = output_dir / ".test_write"
            test_file.write_text("test")
            test_file.unlink()
        except Exception as write_error:
            raise HTTPException(
                status_code=500,
                detail=f"Cannot write to output directory {output_dir}: {str(write_error)}",
            )

        # Tile server URLs
        TILE_SERVERS = {
            "osm": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "esri_street": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
            "esri_satellite": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        }

        server_url = TILE_SERVERS.get(payload.server)
        if not server_url:
            raise HTTPException(
                status_code=400, detail=f"Unknown server: {payload.server}"
            )

        # Helper functions (från tile_converter.py)
        def deg2num(lat_deg: float, lon_deg: float, zoom: int):
            """Konvertera lat/lng till tile koordinater"""
            lat_rad = math.radians(lat_deg)
            n = 2.0**zoom
            xtile = int((lon_deg + 180.0) / 360.0 * n)
            ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
            return (xtile, ytile)

        def get_tile_bounds(
            min_lat: float, min_lon: float, max_lat: float, max_lon: float, zoom: int
        ):
            """Hämta tile bounds för ett område"""
            x_min, y_max = deg2num(max_lat, min_lon, zoom)
            x_max, y_min = deg2num(min_lat, max_lon, zoom)
            return (x_min, y_min, x_max, y_max)

        def download_tile(
            url_template: str, x: int, y: int, z: int, subdomain: str = "a"
        ):
            """Ladda ner en tile"""
            try:
                url = url_template.format(s=subdomain, x=x, y=y, z=z)
                response = requests.get(url, timeout=10)
                response.raise_for_status()
                if response.status_code == 200 and response.content:
                    return response.content
            except requests.exceptions.Timeout:
                output_messages.append(f"Timeout vid nedladdning av tile {z}/{x}/{y}")
            except requests.exceptions.RequestException as e:
                output_messages.append(
                    f"Fel vid nedladdning av tile {z}/{x}/{y}: {str(e)}"
                )
            except Exception as e:
                output_messages.append(
                    f"Oväntat fel vid nedladdning av tile {z}/{x}/{y}: {str(e)}"
                )
            return None

        def upscale_tile(image: Image.Image, scale_factor: int = 2):
            """Förstora en tile"""
            width, height = image.size
            new_width = width * scale_factor
            new_height = height * scale_factor
            upscaled = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
            return upscaled

        # Konvertera bounds till tuple och validera
        if len(payload.bounds) != 4:
            raise HTTPException(
                status_code=400,
                detail="Bounds must contain exactly 4 values: [min_lat, min_lon, max_lat, max_lon]",
            )

        bounds = (
            payload.bounds[0],
            payload.bounds[1],
            payload.bounds[2],
            payload.bounds[3],
        )
        min_lat, min_lon, max_lat, max_lon = bounds

        # Validera bounds
        if not (-90 <= min_lat <= 90) or not (-90 <= max_lat <= 90):
            raise HTTPException(
                status_code=400, detail="Invalid latitude: must be between -90 and 90"
            )
        if not (-180 <= min_lon <= 180) or not (-180 <= max_lon <= 180):
            raise HTTPException(
                status_code=400,
                detail="Invalid longitude: must be between -180 and 180",
            )
        if min_lat >= max_lat or min_lon >= max_lon:
            raise HTTPException(
                status_code=400, detail="Invalid bounds: min must be less than max"
            )

        # Validera zoom levels
        if not payload.zoom_levels or len(payload.zoom_levels) == 0:
            raise HTTPException(
                status_code=400, detail="At least one zoom level must be specified"
            )
        for zoom in payload.zoom_levels:
            if not isinstance(zoom, int) or zoom < 0 or zoom > 23:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid zoom level: {zoom} (must be integer between 0 and 23)",
                )

        total_tiles = 0
        downloaded_tiles = 0
        output_messages = []

        for zoom in payload.zoom_levels:
            x_min, y_min, x_max, y_max = get_tile_bounds(
                min_lat, min_lon, max_lat, max_lon, zoom
            )

            zoom_dir = output_dir / str(zoom)
            zoom_dir.mkdir(exist_ok=True)

            for x in range(x_min, x_max + 1):
                x_dir = zoom_dir / str(x)
                x_dir.mkdir(exist_ok=True)

                for y in range(y_min, y_max + 1):
                    total_tiles += 1
                    tile_path = x_dir / f"{y}.png"

                    # Hoppa över om redan nedladdad
                    if tile_path.exists():
                        continue

                    # Ladda ner tile
                    tile_data = download_tile(server_url, x, y, zoom)
                    if tile_data is None:
                        continue

                    try:
                        # Öppna bild
                        img = Image.open(io.BytesIO(tile_data))

                        # Validera bildformat
                        if img.format not in ["PNG", "JPEG", "JPG"]:
                            output_messages.append(
                                f"Okänt bildformat för {zoom}/{x}/{y}: {img.format}"
                            )
                            continue

                        # Förstora om scale_factor > 1
                        if payload.scale_factor > 1:
                            img = upscale_tile(img, payload.scale_factor)

                        # Spara förstorad tile
                        img.save(tile_path, "PNG", optimize=True)
                        downloaded_tiles += 1

                        if downloaded_tiles % 10 == 0:
                            output_messages.append(
                                f"Nedladdade {downloaded_tiles} tiles..."
                            )

                        # Vänta lite för att inte överbelasta servern
                        time.sleep(0.1)

                    except Image.UnidentifiedImageError:
                        output_messages.append(
                            f"Kunde inte identifiera bildformat för {zoom}/{x}/{y}"
                        )
                        continue
                    except Exception as e:
                        output_messages.append(
                            f"Fel vid bearbetning av {zoom}/{x}/{y}: {str(e)}"
                        )
                        continue

        output_text = "\n".join(output_messages)
        output_text += (
            f"\n\nKlar! Nedladdade {downloaded_tiles} av {total_tiles} tiles."
        )
        output_text += f"\nTiles sparade i: {output_dir.absolute()}"

        return {
            "status": "success",
            "message": "Tiles konverterade och förstorade",
            "output_dir": str(output_dir.relative_to(backend_dir)),
            "tile_size": 256 * payload.scale_factor,
            "stdout": output_text,
            "downloaded_tiles": downloaded_tiles,
            "total_tiles": total_tiles,
        }

    except Exception as e:
        import traceback

        error_details = traceback.format_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error converting tiles: {str(e)}\n\nDetails:\n{error_details}",
        )
