from fastapi import FastAPI, HTTPException, Body, Query
from fastapi.responses import StreamingResponse, Response
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
import pickle
import psycopg2
from psycopg2.extras import RealDictCursor

# Ladda .env-fil om den finns (för lokal utveckling)
try:
    from dotenv import load_dotenv

    # Ladda .env från backend-mappen
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    # python-dotenv är inte installerat, fortsätt utan
    pass


app = FastAPI(title="Dogtracks Geofence Kit", version="0.1.0")

# CORS - Tillåt anrop från alla domäner (för development/prototyping)
# I Railway: tillåt både frontend-domänen och alla Railway-domäner
# Använd regex för att matcha alla Railway-domäner dynamiskt
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|.*\.up\.railway\.app)(:\d+)?",
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",  # Vite default port
        "http://127.0.0.1:5173",
    ],
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
    """Hämta värde från row - fungerar för både Postgres (dict) och SQLite (Row)"""
    if DATABASE_URL:
        # Postgres: row är en dict
        return row[key]
    else:
        # SQLite: row är en sqlite3.Row (dict-liknande)
        # Row stödjer både row[key] och row[0] syntax
        return row[key]


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
                environment TEXT,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            )
        """)
        # Lägg till environment kolumn om den inte finns (för migrations)
        cursor.execute("""
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='track_positions' AND column_name='environment'
                ) THEN
                    ALTER TABLE track_positions ADD COLUMN environment TEXT;
                END IF;
            END $$;
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
                environment TEXT,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            )
        """)
        # Lägg till environment kolumn om den inte finns (för migrations)
        try:
            cursor.execute("ALTER TABLE track_positions ADD COLUMN environment TEXT")
        except Exception:
            pass  # Kolumnen finns redan

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

    # ML-feedback separerad från grunddatabasen – ändrar INTE track_positions
    if is_postgres:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ml_prediction_feedback (
                id SERIAL PRIMARY KEY,
                prediction_filename TEXT NOT NULL,
                position_id INTEGER NOT NULL,
                verified_status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(prediction_filename, position_id),
                FOREIGN KEY (position_id) REFERENCES track_positions(id) ON DELETE CASCADE
            )
        """)
    else:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ml_prediction_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prediction_filename TEXT NOT NULL,
                position_id INTEGER NOT NULL,
                verified_status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(prediction_filename, position_id),
                FOREIGN KEY (position_id) REFERENCES track_positions(id) ON DELETE CASCADE
            )
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
    environment: Optional[str] = (
        None  # Miljö-kategorisering: "urban", "forest", "open", "mixed", etc.
    )
    # FAS 1: Truth levels och ML-metadata
    truth_level: Optional[Literal["T0", "T1", "T2", "T3"]] = (
        "T3"  # T0=manual, T1=verified, T2=ML, T3=raw
    )
    ml_confidence: Optional[float] = None  # Confidence score 0-1 för ML-korrigeringar
    ml_model_version: Optional[str] = None  # Version av ML-modell som användes
    correction_source: Optional[Literal["manual", "ml", "none"]] = (
        "none"  # Källa för korrigering
    )


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
    environment: Optional[str] = None  # Miljö-kategorisering


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


# Version för att verifiera att ny kod är deployad (approved-as-is fix)
API_VERSION = "20260202-approved-as-is"


@app.get("/ping")
@app.get("/api/ping")  # Stöd för frontend som använder /api prefix
def ping():
    # Se till att databasen är initierad
    try:
        init_db()
    except Exception:
        pass  # Ignorera fel vid init (tabeller kan redan finnas)
    return {"status": "ok"}


@app.get("/version")
@app.get("/api/version")
def get_version():
    """Returnerar API-version – använd för att verifiera att ny backend är deployad."""
    return {"version": API_VERSION}


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

    # FAS 1: Hämta truth level och ML-metadata (med fallback till default)
    truth_level = row.get("truth_level", "T3") if "truth_level" in row.keys() else "T3"
    ml_confidence = row.get("ml_confidence") if "ml_confidence" in row.keys() else None
    ml_model_version = (
        row.get("ml_model_version") if "ml_model_version" in row.keys() else None
    )
    correction_source = (
        row.get("correction_source", "none")
        if "correction_source" in row.keys()
        else "none"
    )

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
        environment=row.get("environment") if "environment" in row.keys() else None,
        truth_level=truth_level,
        ml_confidence=ml_confidence,
        ml_model_version=ml_model_version,
        correction_source=correction_source,
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


def calculate_truth_level_for_manual_correction(
    original_lat: float,
    original_lng: float,
    corrected_lat: Optional[float],
    corrected_lng: Optional[float],
) -> tuple[str, str]:
    """
    Beräkna truth level och correction_source för manuell korrigering.

    Returns:
        (truth_level, correction_source)
        - Om korrigering > 1 meter: ('T0', 'manual')
        - Om korrigering <= 1 meter eller ingen korrigering: ('T1', 'none')
    """
    if corrected_lat is None or corrected_lng is None:
        return ("T3", "none")

    # Beräkna avstånd mellan original och korrigerad position
    original = LatLng(lat=original_lat, lng=original_lng)
    corrected = LatLng(lat=corrected_lat, lng=corrected_lng)
    distance = haversine_meters(original, corrected)

    # Om avståndet är > 1 meter = faktiskt flyttad (T0)
    # Om avståndet är <= 1 meter = var korrekt från början (T1)
    if distance > 1.0:
        return ("T0", "manual")
    else:
        return ("T1", "none")


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
@app.get(
    "/api/tracks", response_model=List[Track]
)  # Stöd för frontend som använder /api prefix
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
                annotation_notes,
                environment,
                truth_level,
                ml_confidence,
                ml_model_version,
                correction_source
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


@app.post("/tracks/{track_id}/smooth")
def smooth_track(
    track_id: int,
    window_size: int = 3,
    max_speed_kmh: Optional[float] = None,
    max_accuracy_m: float = 50.0,
    apply_filters: bool = True,
):
    """
    Apply GPS smoothing and filtering to a track.

    Args:
        track_id: ID of the track to smooth
        window_size: Moving average window size (default: 3)
        max_speed_kmh: Max speed threshold in km/h (auto-set if None)
        max_accuracy_m: Max acceptable GPS accuracy in meters (default: 50)
        apply_filters: Whether to apply outlier filters before smoothing

    Returns:
        Smoothed track data with statistics
    """
    from utils.gps_filter import apply_full_filter_pipeline, smooth_track_positions

    conn = get_db()
    cursor = get_cursor(conn)
    placeholder = "%s" if DATABASE_URL else "?"

    # Get track
    execute_query(cursor, f"SELECT * FROM tracks WHERE id = {placeholder}", (track_id,))
    track = cursor.fetchone()

    if track is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")

    track_type = get_row_value(track, "track_type")

    # Get positions
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
            corrected_position_lat,
            corrected_position_lng,
            annotation_notes
        FROM track_positions
        WHERE track_id = {placeholder}
        ORDER BY timestamp
        """,
        (track_id,),
    )

    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return {
            "message": "No positions found for this track",
            "track_id": track_id,
            "original_count": 0,
        }

    # Convert to position objects
    positions = []
    for row in rows:
        pos = {
            "id": get_row_value(row, "id"),
            "track_id": get_row_value(row, "track_id"),
            "position": {
                "lat": get_row_value(row, "position_lat"),
                "lng": get_row_value(row, "position_lng"),
            },
            "timestamp": get_row_value(row, "timestamp"),
            "accuracy": get_row_value(row, "accuracy"),
            "verified_status": get_row_value(row, "verified_status"),
            "annotation_notes": get_row_value(row, "annotation_notes"),
        }

        # Add corrected position if exists
        corr_lat = get_row_value(row, "corrected_position_lat")
        corr_lng = get_row_value(row, "corrected_position_lng")
        if corr_lat and corr_lng:
            pos["corrected_position"] = {"lat": corr_lat, "lng": corr_lng}

        positions.append(pos)

    # Apply smoothing/filtering
    if apply_filters:
        result = apply_full_filter_pipeline(
            positions,
            track_type=track_type,
            smooth_window=window_size,
            max_speed_kmh=max_speed_kmh,
            max_accuracy_m=max_accuracy_m,
        )
    else:
        # Just apply smoothing without filters
        smoothed = smooth_track_positions(positions, window_size)
        result = {
            "original_count": len(positions),
            "filtered_positions": positions,
            "smoothed_positions": smoothed,
            "speed_outliers": [],
            "accuracy_outliers": [],
            "improvement_stats": {
                "original_count": len(positions),
                "after_filtering": len(positions),
                "removed_by_accuracy": 0,
                "removed_by_speed": 0,
                "total_removed": 0,
                "retention_rate": 1.0,
            },
        }

    return {
        "track_id": track_id,
        "track_name": get_row_value(track, "name"),
        "track_type": track_type,
        **result,
    }


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
            annotation_notes,
            environment,
            truth_level,
            ml_confidence,
            ml_model_version,
            correction_source
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
    # FAS 1: Sätt default truth_level=T3 (rå GPS) för nya positioner
    now = datetime.now().isoformat()
    returning = " RETURNING id" if is_postgres else ""
    execute_query(
        cursor,
        f"""
        INSERT INTO track_positions (track_id, position_lat, position_lng, timestamp, accuracy, truth_level, correction_source)
        VALUES ({", ".join([placeholder] * 7)}){returning}
    """,
        (
            track_id,
            payload.position.lat,
            payload.position.lng,
            now,
            payload.accuracy,
            "T3",
            "none",
        ),
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
        # FAS 1: Automatiskt sätt truth_level och correction_source för manuell korrigering
        truth_level, correction_source = calculate_truth_level_for_manual_correction(
            row["position_lat"],
            row["position_lng"],
            payload.corrected_position.lat,
            payload.corrected_position.lng,
        )
        update_fields.append(f"truth_level = {placeholder}")
        params.append(truth_level)
        update_fields.append(f"correction_source = {placeholder}")
        params.append(correction_source)
    elif payload.clear_correction:
        update_fields.append("corrected_lat = NULL")
        update_fields.append("corrected_lng = NULL")
        update_fields.append("corrected_at = NULL")
        # När korrigering tas bort, återställ till T3 (rå GPS)
        update_fields.append("truth_level = 'T3'")
        update_fields.append("correction_source = 'none'")

    if payload.annotation_notes is not None:
        if payload.annotation_notes == "":
            update_fields.append("annotation_notes = NULL")
        else:
            update_fields.append(f"annotation_notes = {placeholder}")
            params.append(payload.annotation_notes)

    if payload.environment is not None:
        if payload.environment == "":
            update_fields.append("environment = NULL")
        else:
            update_fields.append(f"environment = {placeholder}")
            params.append(payload.environment)

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
            annotation_notes,
            environment,
            truth_level,
            ml_confidence,
            ml_model_version,
            correction_source
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


@app.get("/export/annotations-to-ml")
@app.post("/export/annotations-to-ml")
def export_annotations_to_ml(
    filename: str = "annotations.json", track_ids: Optional[str] = None
):
    """
    Export annoterade positioner direkt till ml/data/ mappen för ML-träning.

    Args:
        filename: Namnet på filen (läggs automatiskt till .json om inte angivet)
        track_ids: Komma-separerad lista av track_ids att exportera (om None, exportera alla)

    Returns:
        Success message med filnamn och antal positioner
    """
    try:
        # Säkerställ att filnamnet slutar med .json
        if not filename.endswith(".json"):
            filename = f"{filename}.json"

        # Hämta alla annoterade positioner för ML-träning
        # Inkludera:
        # - Alla 'correct' positioner (även om de inte har corrected_lat/lng - de var korrekta från början)
        # - Alla 'incorrect' positioner som har corrected_lat/lng (färdigjusterade)
        # Detta ger modellen både korrekta och felaktiga positioner att lära sig av
        conn = get_db()
        cursor = get_cursor(conn)

        # Bygg WHERE-klausul
        # 'correct' positioner: inkludera alla (oavsett om de har corrected_lat/lng)
        # 'incorrect' positioner: inkludera bara de som har corrected_lat/lng (färdigjusterade)
        where_conditions = [
            "(tp.verified_status = 'correct' OR (tp.verified_status = 'incorrect' AND tp.corrected_lat IS NOT NULL AND tp.corrected_lng IS NOT NULL))",
        ]

        # Filtrera på track_ids om de är angivna
        params = []
        placeholder = "%s" if DATABASE_URL else "?"
        if track_ids:
            track_id_list = [
                int(tid.strip()) for tid in track_ids.split(",") if tid.strip()
            ]
            if track_id_list:
                # Skapa IN-klausul med rätt antal placeholders
                placeholders = ",".join([placeholder] * len(track_id_list))
                where_conditions.append(f"tp.track_id IN ({placeholders})")
                params.extend(track_id_list)

        where_clause = " AND ".join(where_conditions)

        query = f"""
            SELECT
                tp.id,
                tp.track_id,
                t.name as track_name,
                t.track_type,
                t.human_track_id,
                tp.position_lat,
                tp.position_lng,
                tp.timestamp,
                tp.accuracy,
                tp.verified_status,
                tp.corrected_lat,
                tp.corrected_lng,
                tp.annotation_notes,
                tp.environment
            FROM track_positions tp
            JOIN tracks t ON tp.track_id = t.id
            WHERE {where_clause}
            ORDER BY tp.track_id, tp.timestamp
        """

        execute_query(cursor, query, params if params else None)
        rows = cursor.fetchall()
        conn.close()

        if not rows:
            raise HTTPException(
                status_code=404, detail="Inga annoterade positioner hittades"
            )

        # Konvertera till JSON-format
        annotations = []
        for row in rows:
            # Hämta original position
            orig_lat = get_row_value(row, "position_lat")
            orig_lng = get_row_value(row, "position_lng")
            verified_status = get_row_value(row, "verified_status")
            corr_lat = get_row_value(row, "corrected_lat")
            corr_lng = get_row_value(row, "corrected_lng")
            track_id = get_row_value(row, "track_id")
            track_type = get_row_value(row, "track_type")

            # För 'correct' positioner utan corrected_lat/lng: använd original som corrected
            # (de var korrekta från början, correction_distance = 0)
            if verified_status == "correct" and (corr_lat is None or corr_lng is None):
                corr_lat = orig_lat
                corr_lng = orig_lng

            # Beräkna korrigeringsavstånd (Haversine distance)
            R = 6371000  # Earth radius in meters
            phi1 = math.radians(orig_lat)
            phi2 = math.radians(corr_lat)
            delta_phi = math.radians(corr_lat - orig_lat)
            delta_lambda = math.radians(corr_lng - orig_lng)

            a = (
                math.sin(delta_phi / 2) ** 2
                + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
            )
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            correction_distance = R * c

            annotation = {
                "id": get_row_value(row, "id"),
                "track_id": track_id,
                "track_name": get_row_value(row, "track_name"),
                "track_type": track_type,
                "timestamp": str(get_row_value(row, "timestamp")),
                "verified_status": verified_status,
                "original_position": {"lat": orig_lat, "lng": orig_lng},
                "corrected_position": {"lat": corr_lat, "lng": corr_lng},
                "correction_distance_meters": round(correction_distance, 2),
                "accuracy": get_row_value(row, "accuracy"),
                "annotation_notes": get_row_value(row, "annotation_notes") or "",
                "environment": get_row_value(row, "environment"),  # Kan vara None
            }

            # Lägg till human_track_id för hundspår (för matchning features)
            # Hämta från tracks-tabellen (redan i query)
            human_track_id = get_row_value(row, "human_track_id")
            if track_type == "dog" and human_track_id:
                annotation["human_track_id"] = human_track_id

            annotations.append(annotation)

        # Returnera JSON-data direkt (frontend sparar lokalt)
        # Vi försöker INTE spara till fil på Railway (ephemeral filesystem)

        # Hämta unika spårnamn (filtrera bort None/empty)
        unique_tracks = []
        if annotations:
            unique_tracks = list(
                set(
                    a.get("track_name") or f"Track_{a.get('track_id', 'unknown')}"
                    for a in annotations
                    if a.get("track_name") or a.get("track_id")
                )
            )

        return {
            "message": f"Annotationer exporterade ({len(annotations)} positioner)",
            "filename": filename,
            "annotation_count": len(annotations),
            "tracks": unique_tracks,
            "data": annotations,  # Returnera själva datan så frontend kan spara
        }
    except HTTPException:
        # Re-raise HTTP exceptions (som 404)
        raise
    except Exception as e:
        import traceback

        error_details = traceback.format_exc()
        # Logga till Railway logs
        print(f"ERROR in export_annotations_to_ml:")
        print(f"Exception type: {type(e).__name__}")
        print(f"Exception message: {str(e)}")
        print(f"Traceback:\n{error_details}")
        # Returnera mer detaljerat felmeddelande
        raise HTTPException(
            status_code=500, detail=f"Fel vid export: {type(e).__name__}: {str(e)}"
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
    server: Literal["osm", "esri_street", "esri_satellite", "cartodb_light"] = (
        "esri_street"
    )
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

        # Tile server URLs (esri_satellite har bäst upplösning för terräng/skog)
        TILE_SERVERS = {
            "osm": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "esri_street": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
            "esri_satellite": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            "cartodb_light": "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
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


# ============================================================================
# ML ENDPOINTS
# ============================================================================


def _load_ml_pkl(path: Path):
    """Ladda en .pkl-fil. Ger tydligt 503 om filen är LFS-pekare eller text (t.ex. på Railway utan LFS-fetch)."""
    with open(path, "rb") as f:
        head = f.read(80)
        f.seek(0)
        if head.startswith(b"version https://git-lfs") or head.strip().startswith(
            b"version "
        ):
            raise HTTPException(
                status_code=503,
                detail="Modellfilen är en Git LFS-pekare, inte den riktiga filen. På Railway: lägg till 'git lfs install' och 'git lfs pull' i build-steget (t.ex. i en Dockerfile eller pre-deploy), så att .pkl-filerna hämtas. Se RAILWAY_ML_FIX.md.",
            )
        if head.lstrip().startswith(b"{"):
            raise HTTPException(
                status_code=503,
                detail=f"Filen {path.name} verkar vara JSON/text, inte pickle. Kontrollera att rätt fil laddas.",
            )
        return pickle.load(f)


@app.get("/ml/debug")
@app.get("/api/ml/debug")
def ml_debug():
    """Debug: visa om ml/ och modellfiler finns (för Railway-felsökning)."""
    base = Path(__file__).resolve().parent.parent
    ml_root = base / "ml"
    ml_output = base / "ml" / "output"
    model_info = ml_output / "gps_correction_model_info.json"
    analysis_py = ml_root / "analysis.py"
    return {
        "base": str(base),
        "ml_root": str(ml_root),
        "ml_root_exists": ml_root.exists(),
        "ml_output_exists": ml_output.exists(),
        "model_info_exists": model_info.exists(),
        "analysis_py_exists": analysis_py.exists(),
        "ml_list": [p.name for p in ml_root.iterdir()] if ml_root.exists() else [],
    }


@app.get("/ml/model-info")
@app.get("/api/ml/model-info")  # Stöd för frontend som använder /api prefix
def get_model_info():
    """Hämta information om tränad ML-modell"""
    try:
        ml_dir = Path(__file__).parent.parent / "ml" / "output"
        model_info_path = ml_dir / "gps_correction_model_info.json"

        if not model_info_path.exists():
            raise HTTPException(status_code=404, detail="Ingen tränad modell hittades")

        with open(model_info_path, "r", encoding="utf-8") as f:
            model_info = json.load(f)

        # Lägg till feature importance om det finns (kräver .pkl; på Railway kan de vara LFS-pekare)
        try:
            try:
                import numpy as np
            except ImportError:
                np = None
            if np is not None:
                model_path = ml_dir / "gps_correction_model_best.pkl"
                feature_names_path = ml_dir / "gps_correction_feature_names.pkl"
                if model_path.exists() and feature_names_path.exists():
                    model = _load_ml_pkl(model_path)
                    feature_names = _load_ml_pkl(feature_names_path)
                    if hasattr(model, "feature_importances_"):
                        importances = model.feature_importances_
                        feature_importance = [
                            {"name": name, "importance": float(imp)}
                            for name, imp in zip(feature_names, importances)
                        ]
                        feature_importance.sort(
                            key=lambda x: x["importance"], reverse=True
                        )
                        model_info["feature_importance"] = feature_importance
        except HTTPException:
            # LFS-pekare eller annat .pkl-fel – skippa feature importance, returnera ändå JSON-info
            pass
        except Exception as e:
            print(f"Kunde inte ladda feature importance: {e}")

        return model_info
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Fel vid laddning av modellinfo: {str(e)}"
        )


@app.post("/ml/analyze")
@app.post("/api/ml/analyze")  # Stöd för frontend som använder /api prefix
def run_ml_analysis(track_ids: Optional[str] = None):
    """
    Kör fullständig ML-analys (tränar modell och genererar visualiseringar)

    Args:
        track_ids: Komma-separerad lista av track_ids att använda (om None, använd alla)
    """
    try:
        import subprocess
        import sys

        ml_dir = Path(__file__).parent.parent / "ml"
        analysis_script = ml_dir / "analysis.py"

        if not analysis_script.exists():
            raise HTTPException(
                status_code=404, detail=f"Analysscript hittades inte: {analysis_script}"
            )

        # Om specifika spår är valda, exportera bara dessa först
        if track_ids:
            # Exportera valda spår till ML-data
            track_id_list = [
                int(tid.strip()) for tid in track_ids.split(",") if tid.strip()
            ]
            track_ids_str = ",".join(map(str, track_id_list))

            # Anropa export-endpoint för att skapa JSON-fil med valda spår
            from fastapi import Request

            # Vi behöver exportera datan först
            # För nu, skicka track_ids som environment variable till scriptet
            env = os.environ.copy()
            env["ML_TRACK_IDS"] = track_ids_str
        else:
            env = os.environ.copy()

        # Kör analysen
        result = subprocess.run(
            [sys.executable, str(analysis_script)],
            cwd=str(ml_dir),
            capture_output=True,
            text=True,
            timeout=600,  # 10 minuter timeout
            env=env,
        )

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Analys misslyckades:\n{result.stderr}\n\nOutput:\n{result.stdout}",
            )

        # Läs modellinfo
        output_dir = ml_dir / "output"
        model_info_path = output_dir / "gps_correction_model_info.json"

        if model_info_path.exists():
            with open(model_info_path, "r", encoding="utf-8") as f:
                model_info = json.load(f)

            # Generera URL för grafer (om de finns)
            graph_url = None
            graph_path = output_dir / "gps_analysis.png"
            if graph_path.exists():
                # I production skulle vi behöva serve statiska filer
                # För nu returnerar vi bara info
                graph_url = f"/ml/output/gps_analysis.png"

            return {
                "status": "success",
                "message": "ML-analys klar",
                "total_positions": model_info.get("total_positions", 0),
                "unique_tracks": model_info.get("unique_tracks", 0),
                "best_model": model_info.get("best_model"),
                "test_mae": model_info.get("test_mae"),
                "test_rmse": model_info.get("test_rmse"),
                "test_r2": model_info.get("test_r2"),
                "graph_url": graph_url,
                "stdout": result.stdout[-1000:],  # Sista 1000 tecknen
            }
        else:
            return {
                "status": "success",
                "message": "Analys kördes men modellinfo hittades inte",
                "stdout": result.stdout[-1000:],
            }

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Analys tog för lång tid (>10 min)")
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        raise HTTPException(
            status_code=500,
            detail=f"Fel vid ML-analys: {str(e)}\n\n{traceback.format_exc()}",
        )


@app.post("/ml/apply-correction/{track_id}")
@app.post(
    "/api/ml/apply-correction/{track_id}"
)  # Stöd för frontend som använder /api prefix
def apply_ml_correction(track_id: int):
    """Använd ML-modellen för att automatiskt korrigera GPS-positioner i ett spår"""
    try:
        import numpy as np
        from datetime import datetime
        import math

        # Ladda modell och scaler
        ml_dir = Path(__file__).parent.parent / "ml" / "output"
        model_path = ml_dir / "gps_correction_model_best.pkl"
        scaler_path = ml_dir / "gps_correction_scaler.pkl"
        feature_names_path = ml_dir / "gps_correction_feature_names.pkl"

        if not model_path.exists():
            raise HTTPException(status_code=404, detail="Ingen tränad modell hittades")

        model = _load_ml_pkl(model_path)
        scaler = _load_ml_pkl(scaler_path)
        _ = _load_ml_pkl(feature_names_path)

        # Hämta spåret och positioner
        conn = get_db()
        cursor = get_cursor(conn)

        # Hämta spår
        execute_query(cursor, "SELECT * FROM tracks WHERE id = %s", (track_id,))
        track_row = cursor.fetchone()
        if not track_row:
            conn.close()
            raise HTTPException(
                status_code=404, detail=f"Spår {track_id} hittades inte"
            )

        track_type = get_row_value(track_row, "track_type")

        # Hämta positioner sorterade efter timestamp
        execute_query(
            cursor,
            """
            SELECT id, position_lat, position_lng, timestamp, accuracy
            FROM track_positions
            WHERE track_id = %s
            ORDER BY timestamp ASC
            """,
            (track_id,),
        )
        positions = cursor.fetchall()

        if not positions:
            conn.close()
            raise HTTPException(
                status_code=404, detail="Inga positioner hittades för spåret"
            )

        # Förbered features för varje position
        corrected_count = 0

        for i, pos in enumerate(positions):
            pos_id = get_row_value(pos, "id")
            orig_lat = get_row_value(pos, "position_lat")
            orig_lng = get_row_value(pos, "position_lng")
            accuracy = get_row_value(pos, "accuracy") or 0.0
            timestamp_str = get_row_value(pos, "timestamp")

            # Beräkna features (samma som i prepare_features_advanced)
            features = []

            # GPS accuracy
            features.append(accuracy)
            features.append(accuracy**2)

            # Position
            features.extend([orig_lat, orig_lng])

            # Normaliserad position (använd medelvärde för spåret)
            if len(positions) > 1:
                mean_lat = np.mean(
                    [get_row_value(p, "position_lat") for p in positions]
                )
                mean_lng = np.mean(
                    [get_row_value(p, "position_lng") for p in positions]
                )
                features.extend([orig_lat - mean_lat, orig_lng - mean_lng])
            else:
                features.extend([0.0, 0.0])

            # Track type
            features.append(1 if track_type == "human" else 0)

            # Timestamp features
            try:
                if timestamp_str:
                    dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                    hour = dt.hour
                    weekday = dt.weekday()
                    features.append(math.sin(2 * math.pi * hour / 24))
                    features.append(math.cos(2 * math.pi * hour / 24))
                    features.append(math.sin(2 * math.pi * weekday / 7))
                    features.append(math.cos(2 * math.pi * weekday / 7))
                else:
                    features.extend([0.0, 1.0, 0.0, 1.0])
            except Exception:
                features.extend([0.0, 1.0, 0.0, 1.0])

            # Hastighet, acceleration, etc. (förenklad - använd tidigare positioner)
            speed = 0.0
            acceleration = 0.0
            distance_prev_1 = 0.0
            distance_prev_2 = 0.0
            distance_prev_3 = 0.0
            bearing = 0.0

            if i > 0:
                prev_pos = positions[i - 1]
                prev_lat = get_row_value(prev_pos, "position_lat")
                prev_lng = get_row_value(prev_pos, "position_lng")

                # Haversine distance
                R = 6371000
                phi1 = math.radians(prev_lat)
                phi2 = math.radians(orig_lat)
                delta_phi = math.radians(orig_lat - prev_lat)
                delta_lambda = math.radians(orig_lng - prev_lng)
                a = (
                    math.sin(delta_phi / 2) ** 2
                    + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
                )
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                distance_prev_1 = R * c

                # Hastighet
                try:
                    curr_time = datetime.fromisoformat(
                        timestamp_str.replace("Z", "+00:00")
                    )
                    prev_timestamp = get_row_value(prev_pos, "timestamp")
                    prev_time = datetime.fromisoformat(
                        prev_timestamp.replace("Z", "+00:00")
                    )
                    time_diff = (curr_time - prev_time).total_seconds()
                    if time_diff > 0:
                        speed = distance_prev_1 / time_diff
                except Exception:
                    pass

                # Bearing
                try:
                    lat1_rad = math.radians(prev_lat)
                    lat2_rad = math.radians(orig_lat)
                    delta_lng = math.radians(orig_lng - prev_lng)
                    y = math.sin(delta_lng) * math.cos(lat2_rad)
                    x = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(
                        lat1_rad
                    ) * math.cos(lat2_rad) * math.cos(delta_lng)
                    bearing = math.degrees(math.atan2(y, x))
                    if bearing < 0:
                        bearing += 360
                except Exception:
                    pass

                # Acceleration
                if i > 1:
                    # Förenklad - hoppa över komplexa beräkningar
                    distance_prev_2 = 0.0
                    distance_prev_3 = 0.0

            features.extend(
                [
                    speed,
                    acceleration,
                    distance_prev_1,
                    distance_prev_2,
                    distance_prev_3,
                    bearing,
                ]
            )

            # Rolling statistics (förenklad)
            recent_mean = 0.0
            recent_std = 0.0
            features.extend([recent_mean, recent_std])

            # Interaktioner
            features.extend(
                [accuracy * speed, accuracy * distance_prev_1, speed * distance_prev_1]
            )

            # Förutsäg korrigeringsavstånd
            X = np.array([features])
            X_scaled = scaler.transform(X)
            predicted_correction = model.predict(X_scaled)[0]

            # FAS 1: Beräkna confidence score (förenklad - använd prediction variance)
            # För nu använder vi en enkel heuristik baserad på predicted_correction
            # Högre predicted_correction = högre confidence (tills vidare)
            # TODO: Implementera riktig confidence-beräkning med ensemble eller prediction intervals
            confidence = min(
                1.0, max(0.0, predicted_correction / 10.0)
            )  # Normalisera till 0-1

            # Hämta modellversion (försök läsa från model_info)
            model_version = "unknown"
            try:
                model_info_path = ml_dir / "gps_correction_model_info.json"
                if model_info_path.exists():
                    import json

                    with open(model_info_path, "r", encoding="utf-8") as f:
                        model_info = json.load(f)
                        model_version = model_info.get("model_version", "unknown")
            except Exception:
                pass

            # Beräkna korrigerad position (förenklad - använd riktning från bearing)
            # I verkligheten skulle vi behöva mer sofistikerad logik
            if predicted_correction > 0.1:  # Bara korrigera om förutsägelsen är > 10cm
                # Förenklad korrigering: flytta mot medelvärdet för spåret
                if len(positions) > 1:
                    mean_lat = np.mean(
                        [get_row_value(p, "position_lat") for p in positions]
                    )
                    mean_lng = np.mean(
                        [get_row_value(p, "position_lng") for p in positions]
                    )

                    # Korrigera mot medelvärdet (proportionellt till förutsägt fel)
                    correction_factor = min(
                        predicted_correction / 10.0, 0.5
                    )  # Max 50% korrigering
                    corrected_lat = orig_lat + (mean_lat - orig_lat) * correction_factor
                    corrected_lng = orig_lng + (mean_lng - orig_lng) * correction_factor

                    # FAS 1: Uppdatera positionen med truth_level=T2, ml_confidence, ml_model_version, correction_source='ml'
                    execute_query(
                        cursor,
                        """
                        UPDATE track_positions
                        SET corrected_lat = %s, 
                            corrected_lng = %s,
                            corrected_at = %s,
                            truth_level = 'T2',
                            ml_confidence = %s,
                            ml_model_version = %s,
                            correction_source = 'ml'
                        WHERE id = %s
                        """,
                        (
                            corrected_lat,
                            corrected_lng,
                            datetime.now().isoformat(),
                            confidence,
                            model_version,
                            pos_id,
                        ),
                    )
                    corrected_count += 1

        conn.commit()
        conn.close()

        return {
            "status": "success",
            "message": f"ML-korrigering tillämpad på {corrected_count} positioner",
            "corrected_count": corrected_count,
            "total_positions": len(positions),
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        raise HTTPException(
            status_code=500,
            detail=f"Fel vid ML-korrigering: {str(e)}\n\n{traceback.format_exc()}",
        )


@app.post("/ml/predict/{track_id}")
@app.post("/api/ml/predict/{track_id}")  # Stöd för frontend som använder /api prefix
def predict_ml_corrections(track_id: int):
    """
    Förutsäg ML-korrigeringar för ett spår UTAN att ändra databasen.
    Sparar resultaten i ml/predictions/ som JSON-filer.
    Fungerar på både redan korrigerade spår (jämför förutsägelse vs faktisk) och nya spår.
    """
    try:
        import numpy as np
        from datetime import datetime
        import math

        # Ladda modell och scaler
        ml_dir = Path(__file__).parent.parent / "ml" / "output"
        model_path = ml_dir / "gps_correction_model_best.pkl"
        scaler_path = ml_dir / "gps_correction_scaler.pkl"
        feature_names_path = ml_dir / "gps_correction_feature_names.pkl"

        if not model_path.exists():
            raise HTTPException(status_code=404, detail="Ingen tränad modell hittades")

        model = _load_ml_pkl(model_path)
        scaler = _load_ml_pkl(scaler_path)
        _ = _load_ml_pkl(feature_names_path)

        # Hämta spåret och positioner
        conn = get_db()
        cursor = get_cursor(conn)

        # Hämta spår
        execute_query(cursor, "SELECT * FROM tracks WHERE id = %s", (track_id,))
        track_row = cursor.fetchone()
        if not track_row:
            conn.close()
            raise HTTPException(
                status_code=404, detail=f"Spår {track_id} hittades inte"
            )

        track_name = get_row_value(track_row, "name") or f"Track_{track_id}"
        track_type = get_row_value(track_row, "track_type")

        # Hämta positioner med både original och korrigerade positioner (om de finns)
        execute_query(
            cursor,
            """
            SELECT id, position_lat, position_lng, timestamp, accuracy,
                   corrected_lat, corrected_lng, verified_status, environment
            FROM track_positions
            WHERE track_id = %s
            ORDER BY timestamp ASC
            """,
            (track_id,),
        )
        positions = cursor.fetchall()
        conn.close()

        if not positions:
            raise HTTPException(
                status_code=404, detail="Inga positioner hittades för spåret"
            )

        # Beräkna medelvärde för normalisering
        mean_lat = np.mean([get_row_value(p, "position_lat") for p in positions])
        mean_lng = np.mean([get_row_value(p, "position_lng") for p in positions])

        # Förutsägelser för varje position
        predictions = []
        predicted_corrections_history = []  # För att beräkna rolling statistics
        total_positions = len(positions)
        positions_with_actual_corrections = 0

        for i, pos in enumerate(positions):
            pos_id = get_row_value(pos, "id")
            orig_lat = get_row_value(pos, "position_lat")
            orig_lng = get_row_value(pos, "position_lng")
            accuracy = get_row_value(pos, "accuracy") or 0.0
            timestamp_str = get_row_value(pos, "timestamp")
            actual_corr_lat = get_row_value(pos, "corrected_lat")
            actual_corr_lng = get_row_value(pos, "corrected_lng")
            verified_status = get_row_value(pos, "verified_status") or "pending"

            # Beräkna features (samma som i apply_ml_correction)
            features = []

            # GPS accuracy
            features.append(accuracy)
            features.append(accuracy**2)

            # Position
            features.extend([orig_lat, orig_lng])

            # Normaliserad position
            if len(positions) > 1:
                features.extend([orig_lat - mean_lat, orig_lng - mean_lng])
            else:
                features.extend([0.0, 0.0])

            # Track type
            features.append(1 if track_type == "human" else 0)

            # Timestamp features
            try:
                if timestamp_str:
                    dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                    hour = dt.hour
                    weekday = dt.weekday()
                    features.append(math.sin(2 * math.pi * hour / 24))
                    features.append(math.cos(2 * math.pi * hour / 24))
                    features.append(math.sin(2 * math.pi * weekday / 7))
                    features.append(math.cos(2 * math.pi * weekday / 7))
                else:
                    features.extend([0.0, 1.0, 0.0, 1.0])
            except Exception:
                features.extend([0.0, 1.0, 0.0, 1.0])

            # Hastighet, acceleration, etc.
            speed = 0.0
            acceleration = 0.0
            distance_prev_1 = 0.0
            distance_prev_2 = 0.0
            distance_prev_3 = 0.0
            bearing = 0.0

            if i > 0:
                prev_pos = positions[i - 1]
                prev_lat = get_row_value(prev_pos, "position_lat")
                prev_lng = get_row_value(prev_pos, "position_lng")

                # Haversine distance
                R = 6371000
                phi1 = math.radians(prev_lat)
                phi2 = math.radians(orig_lat)
                delta_phi = math.radians(orig_lat - prev_lat)
                delta_lambda = math.radians(orig_lng - prev_lng)
                a = (
                    math.sin(delta_phi / 2) ** 2
                    + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
                )
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                distance_prev_1 = R * c

                # Hastighet
                try:
                    curr_time = datetime.fromisoformat(
                        timestamp_str.replace("Z", "+00:00")
                    )
                    prev_timestamp = get_row_value(prev_pos, "timestamp")
                    prev_time = datetime.fromisoformat(
                        prev_timestamp.replace("Z", "+00:00")
                    )
                    time_diff = (curr_time - prev_time).total_seconds()
                    if time_diff > 0:
                        speed = distance_prev_1 / time_diff
                except Exception:
                    pass

                # Bearing
                try:
                    lat1_rad = math.radians(prev_lat)
                    lat2_rad = math.radians(orig_lat)
                    delta_lng = math.radians(orig_lng - prev_lng)
                    y = math.sin(delta_lng) * math.cos(lat2_rad)
                    x = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(
                        lat1_rad
                    ) * math.cos(lat2_rad) * math.cos(delta_lng)
                    bearing = math.degrees(math.atan2(y, x))
                    if bearing < 0:
                        bearing += 360
                except Exception:
                    pass

                # Acceleration och distance_prev_2/3
                if i > 1:
                    prev2_pos = positions[i - 2]
                    prev2_lat = get_row_value(prev2_pos, "position_lat")
                    prev2_lng = get_row_value(prev2_pos, "position_lng")

                    # Distance prev 2
                    phi1_prev = math.radians(prev2_lat)
                    phi2_prev = math.radians(prev_lat)
                    delta_phi_prev = math.radians(prev_lat - prev2_lat)
                    delta_lambda_prev = math.radians(prev_lng - prev2_lng)
                    a_prev = (
                        math.sin(delta_phi_prev / 2) ** 2
                        + math.cos(phi1_prev)
                        * math.cos(phi2_prev)
                        * math.sin(delta_lambda_prev / 2) ** 2
                    )
                    c_prev = 2 * math.atan2(math.sqrt(a_prev), math.sqrt(1 - a_prev))
                    distance_prev_2 = R * c_prev

                    # Acceleration
                    try:
                        prev2_timestamp = get_row_value(prev2_pos, "timestamp")
                        prev2_time = datetime.fromisoformat(
                            prev2_timestamp.replace("Z", "+00:00")
                        )
                        time_diff_prev = (prev_time - prev2_time).total_seconds()
                        if time_diff_prev > 0:
                            prev_speed = distance_prev_2 / time_diff_prev
                            if time_diff > 0:
                                acceleration = (speed - prev_speed) / time_diff
                    except Exception:
                        pass

                    # Distance prev 3
                    if i > 2:
                        prev3_pos = positions[i - 3]
                        prev3_lat = get_row_value(prev3_pos, "position_lat")
                        prev3_lng = get_row_value(prev3_pos, "position_lng")

                        phi1_prev3 = math.radians(prev3_lat)
                        phi2_prev3 = math.radians(prev2_lat)
                        delta_phi_prev3 = math.radians(prev2_lat - prev3_lat)
                        delta_lambda_prev3 = math.radians(prev2_lng - prev3_lng)
                        a_prev3 = (
                            math.sin(delta_phi_prev3 / 2) ** 2
                            + math.cos(phi1_prev3)
                            * math.cos(phi2_prev3)
                            * math.sin(delta_lambda_prev3 / 2) ** 2
                        )
                        c_prev3 = 2 * math.atan2(
                            math.sqrt(a_prev3), math.sqrt(1 - a_prev3)
                        )
                        distance_prev_3 = R * c_prev3

            features.extend(
                [
                    speed,
                    acceleration,
                    distance_prev_1,
                    distance_prev_2,
                    distance_prev_3,
                    bearing,
                ]
            )

            # Rolling statistics - beräkna från tidigare förutsägelser
            # Använd historiken från tidigare positioner i samma spår
            if i >= 2 and len(predicted_corrections_history) >= 2:
                # Använd de senaste 2 förutsägelserna (för att matcha träningen som använder max(0, i-2) till i)
                recent_corrections = predicted_corrections_history[-2:]
                recent_mean = float(np.mean(recent_corrections))
                recent_std = (
                    float(np.std(recent_corrections))
                    if len(recent_corrections) > 1
                    else 0.0
                )
            else:
                recent_mean = 0.0
                recent_std = 0.0
            features.extend([recent_mean, recent_std])

            # Interaktioner
            features.extend(
                [accuracy * speed, accuracy * distance_prev_1, speed * distance_prev_1]
            )

            # Environment features (one-hot encoding) - 8 kategorier
            environment = get_row_value(pos, "environment")
            environment_categories = [
                "urban",
                "suburban",
                "forest",
                "open",
                "park",
                "water",
                "mountain",
                "mixed",
            ]
            for env_cat in environment_categories:
                env_value = 1.0 if environment == env_cat else 0.0
                features.append(env_value)

            # Smoothing features (spår-jämnhet)
            # Kurvatur
            curvature = 0.0
            if i > 0 and i < len(positions) - 1:
                try:
                    prev_pos = positions[i - 1]
                    next_pos = positions[i + 1]
                    prev_lat = get_row_value(prev_pos, "position_lat")
                    prev_lng = get_row_value(prev_pos, "position_lng")
                    next_lat = get_row_value(next_pos, "position_lat")
                    next_lng = get_row_value(next_pos, "position_lng")

                    # Beräkna riktning för segment 1 (prev -> curr)
                    lat1_rad = math.radians(prev_lat)
                    lat2_rad = math.radians(orig_lat)
                    delta_lng1 = math.radians(orig_lng - prev_lng)
                    y1 = math.sin(delta_lng1) * math.cos(lat2_rad)
                    x1 = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(
                        lat1_rad
                    ) * math.cos(lat2_rad) * math.cos(delta_lng1)
                    bearing1 = math.atan2(y1, x1)

                    # Beräkna riktning för segment 2 (curr -> next)
                    lat3_rad = math.radians(next_lat)
                    delta_lng2 = math.radians(next_lng - orig_lng)
                    y2 = math.sin(delta_lng2) * math.cos(lat3_rad)
                    x2 = math.cos(lat2_rad) * math.sin(lat3_rad) - math.sin(
                        lat2_rad
                    ) * math.cos(lat3_rad) * math.cos(delta_lng2)
                    bearing2 = math.atan2(y2, x2)

                    # Kurvatur = skillnaden i riktning
                    curvature = abs(bearing1 - bearing2)
                    if curvature > math.pi:
                        curvature = 2 * math.pi - curvature
                except Exception:
                    pass

            # Hastighetsvariation (speed consistency)
            speed_consistency = 0.0
            if len(positions) >= 2:
                try:
                    speeds = []
                    window = 5
                    start_idx = max(0, i - window)
                    end_idx = min(len(positions), i + window + 1)

                    for j in range(start_idx, end_idx - 1):
                        if j >= len(positions) - 1:
                            break
                        p1 = positions[j]
                        p2 = positions[j + 1]
                        lat1 = get_row_value(p1, "position_lat")
                        lng1 = get_row_value(p1, "position_lng")
                        lat2 = get_row_value(p2, "position_lat")
                        lng2 = get_row_value(p2, "position_lng")

                        R = 6371000
                        phi1 = math.radians(lat1)
                        phi2 = math.radians(lat2)
                        delta_phi = math.radians(lat2 - lat1)
                        delta_lambda = math.radians(lng2 - lng1)
                        a = (
                            math.sin(delta_phi / 2) ** 2
                            + math.cos(phi1)
                            * math.cos(phi2)
                            * math.sin(delta_lambda / 2) ** 2
                        )
                        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                        dist = R * c

                        try:
                            time1 = datetime.fromisoformat(
                                get_row_value(p1, "timestamp").replace("Z", "+00:00")
                            )
                            time2 = datetime.fromisoformat(
                                get_row_value(p2, "timestamp").replace("Z", "+00:00")
                            )
                            time_diff = (time2 - time1).total_seconds()
                            if time_diff > 0:
                                speeds.append(dist / time_diff)
                        except Exception:
                            pass

                    if len(speeds) >= 2:
                        speed_consistency = float(np.std(speeds))
                except Exception:
                    pass

            # Position-jump
            position_jump = 0.0
            if i > 0 and speed > 0:
                try:
                    prev_pos = positions[i - 1]
                    prev_lat = get_row_value(prev_pos, "position_lat")
                    prev_lng = get_row_value(prev_pos, "position_lng")
                    prev_time_str = get_row_value(prev_pos, "timestamp")

                    curr_time = datetime.fromisoformat(
                        timestamp_str.replace("Z", "+00:00")
                    )
                    prev_time = datetime.fromisoformat(
                        prev_time_str.replace("Z", "+00:00")
                    )
                    time_diff = (curr_time - prev_time).total_seconds()

                    if time_diff > 0:
                        # Förväntad avstånd
                        expected_distance = speed * time_diff

                        # Faktiskt avstånd
                        R = 6371000
                        phi1 = math.radians(prev_lat)
                        phi2 = math.radians(orig_lat)
                        delta_phi = math.radians(orig_lat - prev_lat)
                        delta_lambda = math.radians(orig_lng - prev_lng)
                        a = (
                            math.sin(delta_phi / 2) ** 2
                            + math.cos(phi1)
                            * math.cos(phi2)
                            * math.sin(delta_lambda / 2) ** 2
                        )
                        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                        actual_distance = R * c

                        position_jump = abs(actual_distance - expected_distance)
                except Exception:
                    pass

            features.extend([curvature, speed_consistency, position_jump])

            # Matchning features (närhetsmatchning med människaspår för hundspår)
            distance_to_human = 999.0
            direction_to_human = 0.0
            human_track_speed = 0.0
            human_track_exists = 0.0

            if track_type == "dog":
                # Hämta human_track_id från track_row
                human_track_id = get_row_value(track_row, "human_track_id")
                if human_track_id:
                    # Hämta människaspår-positioner
                    conn_temp = get_db()
                    cursor_temp = get_cursor(conn_temp)
                    execute_query(
                        cursor_temp,
                        """
                        SELECT position_lat, position_lng, timestamp
                        FROM track_positions
                        WHERE track_id = %s
                        ORDER BY timestamp ASC
                        """,
                        (human_track_id,),
                    )
                    human_positions = cursor_temp.fetchall()
                    conn_temp.close()

                    if human_positions:
                        human_track_exists = 1.0

                        # Hitta närmaste människaspår-position
                        try:
                            dog_time = datetime.fromisoformat(
                                timestamp_str.replace("Z", "+00:00")
                            )
                            nearest_human_pos = None
                            nearest_distance = 999.0

                            for human_pos in human_positions:
                                human_lat = get_row_value(human_pos, "position_lat")
                                human_lng = get_row_value(human_pos, "position_lng")
                                human_time_str = get_row_value(human_pos, "timestamp")

                                if not all([human_lat, human_lng, human_time_str]):
                                    continue

                                # Beräkna avstånd
                                R = 6371000
                                phi1 = math.radians(orig_lat)
                                phi2 = math.radians(human_lat)
                                delta_phi = math.radians(human_lat - orig_lat)
                                delta_lambda = math.radians(human_lng - orig_lng)
                                a = (
                                    math.sin(delta_phi / 2) ** 2
                                    + math.cos(phi1)
                                    * math.cos(phi2)
                                    * math.sin(delta_lambda / 2) ** 2
                                )
                                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                                distance = R * c

                                # Prioritera positioner nära i tid
                                try:
                                    human_time = datetime.fromisoformat(
                                        human_time_str.replace("Z", "+00:00")
                                    )
                                    time_diff = abs(
                                        (dog_time - human_time).total_seconds()
                                    )
                                    combined_score = distance + (time_diff * 0.1)

                                    if combined_score < nearest_distance:
                                        nearest_distance = distance
                                        nearest_human_pos = {
                                            "lat": human_lat,
                                            "lng": human_lng,
                                            "timestamp": human_time_str,
                                        }

                                        # Beräkna hastighet på människaspår
                                        human_idx = human_positions.index(human_pos)
                                        if human_idx > 0:
                                            prev_human = human_positions[human_idx - 1]
                                            prev_human_lat = get_row_value(
                                                prev_human, "position_lat"
                                            )
                                            prev_human_lng = get_row_value(
                                                prev_human, "position_lng"
                                            )
                                            prev_human_time_str = get_row_value(
                                                prev_human, "timestamp"
                                            )
                                            if (
                                                prev_human_lat
                                                and prev_human_lng
                                                and prev_human_time_str
                                            ):
                                                prev_human_time = (
                                                    datetime.fromisoformat(
                                                        prev_human_time_str.replace(
                                                            "Z", "+00:00"
                                                        )
                                                    )
                                                )
                                                R = 6371000
                                                phi1_h = math.radians(prev_human_lat)
                                                phi2_h = math.radians(human_lat)
                                                delta_phi_h = math.radians(
                                                    human_lat - prev_human_lat
                                                )
                                                delta_lambda_h = math.radians(
                                                    human_lng - prev_human_lng
                                                )
                                                a_h = (
                                                    math.sin(delta_phi_h / 2) ** 2
                                                    + math.cos(phi1_h)
                                                    * math.cos(phi2_h)
                                                    * math.sin(delta_lambda_h / 2) ** 2
                                                )
                                                c_h = 2 * math.atan2(
                                                    math.sqrt(a_h), math.sqrt(1 - a_h)
                                                )
                                                human_dist = R * c_h
                                                human_time_diff = (
                                                    human_time - prev_human_time
                                                ).total_seconds()
                                                if human_time_diff > 0:
                                                    human_track_speed = (
                                                        human_dist / human_time_diff
                                                    )
                                except Exception:
                                    if distance < nearest_distance:
                                        nearest_distance = distance
                                        nearest_human_pos = {
                                            "lat": human_lat,
                                            "lng": human_lng,
                                        }

                            if nearest_human_pos:
                                distance_to_human = nearest_distance

                                # Beräkna riktning mot människaspår
                                try:
                                    human_lat = nearest_human_pos["lat"]
                                    human_lng = nearest_human_pos["lng"]
                                    lat1_rad = math.radians(orig_lat)
                                    lat2_rad = math.radians(human_lat)
                                    delta_lng = math.radians(human_lng - orig_lng)
                                    y = math.sin(delta_lng) * math.cos(lat2_rad)
                                    x = math.cos(lat1_rad) * math.sin(
                                        lat2_rad
                                    ) - math.sin(lat1_rad) * math.cos(
                                        lat2_rad
                                    ) * math.cos(delta_lng)
                                    direction_to_human = math.degrees(math.atan2(y, x))
                                    if direction_to_human < 0:
                                        direction_to_human += 360
                                except Exception:
                                    pass
                        except Exception:
                            pass

            features.extend(
                [
                    distance_to_human,
                    direction_to_human,
                    human_track_speed,
                    human_track_exists,
                ]
            )

            # Förutsäg korrigeringsavstånd
            X = np.array([features])
            X_scaled = scaler.transform(X)
            predicted_correction_distance = model.predict(X_scaled)[0]

            # Spara förutsägelsen för rolling statistics i nästa iteration
            predicted_corrections_history.append(predicted_correction_distance)

            # Beräkna förutsagd korrigerad position (samma logik som i apply_ml_correction)
            predicted_corr_lat = orig_lat
            predicted_corr_lng = orig_lng
            if predicted_correction_distance > 0.1:  # Bara korrigera om > 10cm
                if len(positions) > 1:
                    correction_factor = min(
                        predicted_correction_distance / 10.0, 0.5
                    )  # Max 50% korrigering
                    predicted_corr_lat = (
                        orig_lat + (mean_lat - orig_lat) * correction_factor
                    )
                    predicted_corr_lng = (
                        orig_lng + (mean_lng - orig_lng) * correction_factor
                    )

            # Beräkna faktiskt korrigeringsavstånd (om korrigering finns)
            # Om positionen har corrected_lat/lng → beräkna avstånd
            # Om positionen är verified='correct' men INTE flyttad → 0 m (stämde från början)
            actual_correction_distance = None
            was_approved_as_is = False
            actual_corr_position = None

            if actual_corr_lat is not None and actual_corr_lng is not None:
                positions_with_actual_corrections += 1
                # Haversine distance mellan original och korrigerad
                R = 6371000
                phi1 = math.radians(orig_lat)
                phi2 = math.radians(actual_corr_lat)
                delta_phi = math.radians(actual_corr_lat - orig_lat)
                delta_lambda = math.radians(actual_corr_lng - orig_lng)
                a = (
                    math.sin(delta_phi / 2) ** 2
                    + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
                )
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                actual_correction_distance = R * c
                actual_corr_position = {
                    "lat": float(actual_corr_lat),
                    "lng": float(actual_corr_lng),
                }
            elif (verified_status or "").strip().lower() == "correct":
                # Position godkänd men INTE flyttad → original stämde, 0 m korrigering
                positions_with_actual_corrections += 1
                actual_correction_distance = 0.0
                was_approved_as_is = True
                actual_corr_position = {"lat": orig_lat, "lng": orig_lng}

            # Beräkna avstånd mellan förutsagd och faktisk korrigering (om båda finns)
            prediction_error = None
            if actual_correction_distance is not None:
                prediction_error = abs(
                    predicted_correction_distance - actual_correction_distance
                )

            predictions.append(
                {
                    "position_id": pos_id,
                    "timestamp": timestamp_str,
                    "original_position": {"lat": orig_lat, "lng": orig_lng},
                    "predicted_correction_distance_meters": float(
                        predicted_correction_distance
                    ),
                    "predicted_corrected_position": {
                        "lat": float(predicted_corr_lat),
                        "lng": float(predicted_corr_lng),
                    },
                    "actual_correction_distance_meters": (
                        float(actual_correction_distance)
                        if actual_correction_distance is not None
                        else None
                    ),
                    "actual_corrected_position": actual_corr_position,
                    "was_approved_as_is": was_approved_as_is,
                    "prediction_error_meters": (
                        float(prediction_error)
                        if prediction_error is not None
                        else None
                    ),
                    "verified_status": verified_status,
                    "gps_accuracy": float(accuracy) if accuracy else None,
                }
            )

        # Beräkna statistik
        predicted_distances = [
            p["predicted_correction_distance_meters"] for p in predictions
        ]
        actual_distances = [
            p["actual_correction_distance_meters"]
            for p in predictions
            if p["actual_correction_distance_meters"] is not None
        ]
        prediction_errors = [
            p["prediction_error_meters"]
            for p in predictions
            if p["prediction_error_meters"] is not None
        ]

        statistics = {
            "total_positions": total_positions,
            "positions_with_actual_corrections": positions_with_actual_corrections,
            "positions_without_corrections": (
                total_positions - positions_with_actual_corrections
            ),
            "predicted_corrections": {
                "mean_meters": float(np.mean(predicted_distances)),
                "max_meters": float(np.max(predicted_distances)),
                "min_meters": float(np.min(predicted_distances)),
                "median_meters": float(np.median(predicted_distances)),
            },
        }

        if actual_distances:
            statistics["actual_corrections"] = {
                "mean_meters": float(np.mean(actual_distances)),
                "max_meters": float(np.max(actual_distances)),
                "min_meters": float(np.min(actual_distances)),
                "median_meters": float(np.median(actual_distances)),
            }

        if prediction_errors:
            statistics["prediction_accuracy"] = {
                "mean_error_meters": float(np.mean(prediction_errors)),
                "max_error_meters": float(np.max(prediction_errors)),
                "median_error_meters": float(np.median(prediction_errors)),
            }

        # Spara till JSON-fil
        predictions_dir = Path(__file__).parent.parent / "ml" / "predictions"
        predictions_dir.mkdir(exist_ok=True)

        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_track_name = "".join(
            c if c.isalnum() or c in ("-", "_") else "_" for c in track_name
        )
        filename = f"predictions_{safe_track_name}_{track_id}_{timestamp_str}.json"
        filepath = predictions_dir / filename

        result = {
            "track_id": track_id,
            "track_name": track_name,
            "track_type": track_type,
            "prediction_timestamp": datetime.now().isoformat(),
            "statistics": statistics,
            "predictions": predictions,
        }

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        return {
            "status": "success",
            "message": f"Förutsägelser genererade för {total_positions} positioner",
            "filepath": str(filepath.relative_to(Path(__file__).parent.parent)),
            "statistics": statistics,
            "predictions_count": len(predictions),
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        raise HTTPException(
            status_code=500,
            detail=f"Fel vid ML-förutsägelse: {str(e)}\n\n{traceback.format_exc()}",
        )


@app.get("/ml/predict/multiple")
@app.get("/api/ml/predict/multiple")  # Stöd för frontend som använder /api prefix
def predict_ml_corrections_multiple(
    track_ids: str = Query(..., description="Komma-separerad lista av track_ids"),
):
    """
    Förutsäg ML-korrigeringar för flera spår UTAN att ändra databasen.
    Sparar resultaten i ml/predictions/ som JSON-filer.
    Fungerar på både redan korrigerade spår (jämför förutsägelse vs faktisk) och nya spår.
    """
    try:
        import numpy as np
        from datetime import datetime
        import math

        # Parse track_ids
        track_id_list = [
            int(tid.strip()) for tid in track_ids.split(",") if tid.strip()
        ]
        if not track_id_list:
            raise HTTPException(status_code=400, detail="Inga track_ids angivna")

        # Ladda modell och scaler
        ml_dir = Path(__file__).parent.parent / "ml" / "output"
        model_path = ml_dir / "gps_correction_model_best.pkl"
        scaler_path = ml_dir / "gps_correction_scaler.pkl"
        feature_names_path = ml_dir / "gps_correction_feature_names.pkl"

        if not model_path.exists():
            raise HTTPException(status_code=404, detail="Ingen tränad modell hittades")

        model = _load_ml_pkl(model_path)
        scaler = _load_ml_pkl(scaler_path)
        _ = _load_ml_pkl(feature_names_path)

        # Hämta alla spår och positioner
        conn = get_db()
        cursor = get_cursor(conn)

        all_tracks_data = []
        all_predictions = []
        total_positions = 0
        positions_with_actual_corrections = 0

        for track_id in track_id_list:
            # Hämta spår
            execute_query(cursor, "SELECT * FROM tracks WHERE id = %s", (track_id,))
            track_row = cursor.fetchone()
            if not track_row:
                continue  # Hoppa över om spåret inte finns

            track_name = get_row_value(track_row, "name") or f"Track_{track_id}"
            track_type = get_row_value(track_row, "track_type")

            # Hämta positioner
            execute_query(
                cursor,
                """
                SELECT id, position_lat, position_lng, timestamp, accuracy,
                       corrected_lat, corrected_lng, verified_status, environment
                FROM track_positions
                WHERE track_id = %s
                ORDER BY timestamp ASC
                """,
                (track_id,),
            )
            positions = cursor.fetchall()

            if not positions:
                continue  # Hoppa över om inga positioner finns

            all_tracks_data.append(
                {
                    "track_id": track_id,
                    "track_name": track_name,
                    "track_type": track_type,
                    "positions": positions,
                }
            )

        conn.close()

        if not all_tracks_data:
            raise HTTPException(
                status_code=404, detail="Inga spår med positioner hittades"
            )

        # Beräkna medelvärde för normalisering (över alla spår)
        all_lats = []
        all_lngs = []
        for track_data in all_tracks_data:
            for pos in track_data["positions"]:
                all_lats.append(get_row_value(pos, "position_lat"))
                all_lngs.append(get_row_value(pos, "position_lng"))
        mean_lat = np.mean(all_lats) if all_lats else 0.0
        mean_lng = np.mean(all_lngs) if all_lngs else 0.0

        # Förutsägelser för varje spår
        for track_data in all_tracks_data:
            track_id = track_data["track_id"]
            track_name = track_data["track_name"]
            track_type = track_data["track_type"]
            positions = track_data["positions"]

            predicted_corrections_history = []  # Per spår

            for i, pos in enumerate(positions):
                pos_id = get_row_value(pos, "id")
                orig_lat = get_row_value(pos, "position_lat")
                orig_lng = get_row_value(pos, "position_lng")
                accuracy = get_row_value(pos, "accuracy") or 0.0
                timestamp_str = get_row_value(pos, "timestamp")
                actual_corr_lat = get_row_value(pos, "corrected_lat")
                actual_corr_lng = get_row_value(pos, "corrected_lng")
                verified_status = get_row_value(pos, "verified_status") or "pending"

                # Beräkna features (samma logik som i predict_ml_corrections)
                features = []

                # GPS accuracy
                features.append(accuracy)
                features.append(accuracy**2)

                # Position
                features.extend([orig_lat, orig_lng])

                # Normaliserad position (använd global mean)
                features.extend([orig_lat - mean_lat, orig_lng - mean_lng])

                # Track type
                features.append(1 if track_type == "human" else 0)

                # Timestamp features
                try:
                    if timestamp_str:
                        dt = datetime.fromisoformat(
                            timestamp_str.replace("Z", "+00:00")
                        )
                        hour = dt.hour
                        weekday = dt.weekday()
                        features.append(math.sin(2 * math.pi * hour / 24))
                        features.append(math.cos(2 * math.pi * hour / 24))
                        features.append(math.sin(2 * math.pi * weekday / 7))
                        features.append(math.cos(2 * math.pi * weekday / 7))
                    else:
                        features.extend([0.0, 1.0, 0.0, 1.0])
                except Exception:
                    features.extend([0.0, 1.0, 0.0, 1.0])

                # Hastighet, acceleration, etc. (samma logik som i predict_ml_corrections)
                speed = 0.0
                acceleration = 0.0
                distance_prev_1 = 0.0
                distance_prev_2 = 0.0
                distance_prev_3 = 0.0
                bearing = 0.0

                if i > 0:
                    prev_pos = positions[i - 1]
                    prev_lat = get_row_value(prev_pos, "position_lat")
                    prev_lng = get_row_value(prev_pos, "position_lng")

                    # Haversine distance
                    R = 6371000
                    phi1 = math.radians(prev_lat)
                    phi2 = math.radians(orig_lat)
                    delta_phi = math.radians(orig_lat - prev_lat)
                    delta_lambda = math.radians(orig_lng - prev_lng)
                    a = (
                        math.sin(delta_phi / 2) ** 2
                        + math.cos(phi1)
                        * math.cos(phi2)
                        * math.sin(delta_lambda / 2) ** 2
                    )
                    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                    distance_prev_1 = R * c

                    # Hastighet
                    try:
                        curr_time = datetime.fromisoformat(
                            timestamp_str.replace("Z", "+00:00")
                        )
                        prev_timestamp = get_row_value(prev_pos, "timestamp")
                        prev_time = datetime.fromisoformat(
                            prev_timestamp.replace("Z", "+00:00")
                        )
                        time_diff = (curr_time - prev_time).total_seconds()
                        if time_diff > 0:
                            speed = distance_prev_1 / time_diff
                    except Exception:
                        pass

                    # Bearing
                    try:
                        lat1_rad = math.radians(prev_lat)
                        lat2_rad = math.radians(orig_lat)
                        delta_lng = math.radians(orig_lng - prev_lng)
                        y = math.sin(delta_lng) * math.cos(lat2_rad)
                        x = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(
                            lat1_rad
                        ) * math.cos(lat2_rad) * math.cos(delta_lng)
                        bearing = math.degrees(math.atan2(y, x))
                        if bearing < 0:
                            bearing += 360
                    except Exception:
                        pass

                    # Acceleration och distance_prev_2/3
                    if i > 1:
                        prev2_pos = positions[i - 2]
                        prev2_lat = get_row_value(prev2_pos, "position_lat")
                        prev2_lng = get_row_value(prev2_pos, "position_lng")

                        # Distance prev 2
                        phi1_prev = math.radians(prev2_lat)
                        phi2_prev = math.radians(prev_lat)
                        delta_phi_prev = math.radians(prev_lat - prev2_lat)
                        delta_lambda_prev = math.radians(prev_lng - prev2_lng)
                        a_prev = (
                            math.sin(delta_phi_prev / 2) ** 2
                            + math.cos(phi1_prev)
                            * math.cos(phi2_prev)
                            * math.sin(delta_lambda_prev / 2) ** 2
                        )
                        c_prev = 2 * math.atan2(
                            math.sqrt(a_prev), math.sqrt(1 - a_prev)
                        )
                        distance_prev_2 = R * c_prev

                        # Acceleration
                        try:
                            prev2_timestamp = get_row_value(prev2_pos, "timestamp")
                            prev2_time = datetime.fromisoformat(
                                prev2_timestamp.replace("Z", "+00:00")
                            )
                            time_diff_prev = (prev_time - prev2_time).total_seconds()
                            if time_diff_prev > 0:
                                prev_speed = distance_prev_2 / time_diff_prev
                                if time_diff > 0:
                                    acceleration = (speed - prev_speed) / time_diff
                        except Exception:
                            pass

                        # Distance prev 3
                        if i > 2:
                            prev3_pos = positions[i - 3]
                            prev3_lat = get_row_value(prev3_pos, "position_lat")
                            prev3_lng = get_row_value(prev3_pos, "position_lng")

                            phi1_prev3 = math.radians(prev3_lat)
                            phi2_prev3 = math.radians(prev2_lat)
                            delta_phi_prev3 = math.radians(prev2_lat - prev3_lat)
                            delta_lambda_prev3 = math.radians(prev2_lng - prev3_lng)
                            a_prev3 = (
                                math.sin(delta_phi_prev3 / 2) ** 2
                                + math.cos(phi1_prev3)
                                * math.cos(phi2_prev3)
                                * math.sin(delta_lambda_prev3 / 2) ** 2
                            )
                            c_prev3 = 2 * math.atan2(
                                math.sqrt(a_prev3), math.sqrt(1 - a_prev3)
                            )
                            distance_prev_3 = R * c_prev3

                features.extend(
                    [
                        speed,
                        acceleration,
                        distance_prev_1,
                        distance_prev_2,
                        distance_prev_3,
                        bearing,
                    ]
                )

                # Rolling statistics
                if i >= 2 and len(predicted_corrections_history) >= 2:
                    recent_corrections = predicted_corrections_history[-2:]
                    recent_mean = float(np.mean(recent_corrections))
                    recent_std = (
                        float(np.std(recent_corrections))
                        if len(recent_corrections) > 1
                        else 0.0
                    )
                else:
                    recent_mean = 0.0
                    recent_std = 0.0
                features.extend([recent_mean, recent_std])

                # Interaktioner
                features.extend(
                    [
                        accuracy * speed,
                        accuracy * distance_prev_1,
                        speed * distance_prev_1,
                    ]
                )

                # Environment features
                environment = get_row_value(pos, "environment")
                environment_categories = [
                    "urban",
                    "suburban",
                    "forest",
                    "open",
                    "park",
                    "water",
                    "mountain",
                    "mixed",
                ]
                for env_cat in environment_categories:
                    env_value = 1.0 if environment == env_cat else 0.0
                    features.append(env_value)

                # Smoothing features (spår-jämnhet) - samma som i predict_ml_corrections
                # Kurvatur
                curvature = 0.0
                if i > 0 and i < len(positions) - 1:
                    try:
                        prev_pos = positions[i - 1]
                        next_pos = positions[i + 1]
                        prev_lat = get_row_value(prev_pos, "position_lat")
                        prev_lng = get_row_value(prev_pos, "position_lng")
                        next_lat = get_row_value(next_pos, "position_lat")
                        next_lng = get_row_value(next_pos, "position_lng")

                        # Beräkna riktning för segment 1 (prev -> curr)
                        lat1_rad = math.radians(prev_lat)
                        lat2_rad = math.radians(orig_lat)
                        delta_lng1 = math.radians(orig_lng - prev_lng)
                        y1 = math.sin(delta_lng1) * math.cos(lat2_rad)
                        x1 = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(
                            lat1_rad
                        ) * math.cos(lat2_rad) * math.cos(delta_lng1)
                        bearing1 = math.atan2(y1, x1)

                        # Beräkna riktning för segment 2 (curr -> next)
                        lat3_rad = math.radians(next_lat)
                        delta_lng2 = math.radians(next_lng - orig_lng)
                        y2 = math.sin(delta_lng2) * math.cos(lat3_rad)
                        x2 = math.cos(lat2_rad) * math.sin(lat3_rad) - math.sin(
                            lat2_rad
                        ) * math.cos(lat3_rad) * math.cos(delta_lng2)
                        bearing2 = math.atan2(y2, x2)

                        # Kurvatur = skillnaden i riktning
                        curvature = abs(bearing1 - bearing2)
                        if curvature > math.pi:
                            curvature = 2 * math.pi - curvature
                    except Exception:
                        pass

                # Hastighetsvariation (speed consistency)
                speed_consistency = 0.0
                if len(positions) >= 2:
                    try:
                        speeds = []
                        window = 5
                        start_idx = max(0, i - window)
                        end_idx = min(len(positions), i + window + 1)

                        for j in range(start_idx, end_idx - 1):
                            if j >= len(positions) - 1:
                                break
                            p1 = positions[j]
                            p2 = positions[j + 1]
                            lat1 = get_row_value(p1, "position_lat")
                            lng1 = get_row_value(p1, "position_lng")
                            lat2 = get_row_value(p2, "position_lat")
                            lng2 = get_row_value(p2, "position_lng")

                            R = 6371000
                            phi1 = math.radians(lat1)
                            phi2 = math.radians(lat2)
                            delta_phi = math.radians(lat2 - lat1)
                            delta_lambda = math.radians(lng2 - lng1)
                            a = (
                                math.sin(delta_phi / 2) ** 2
                                + math.cos(phi1)
                                * math.cos(phi2)
                                * math.sin(delta_lambda / 2) ** 2
                            )
                            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                            dist = R * c

                            try:
                                time1 = datetime.fromisoformat(
                                    get_row_value(p1, "timestamp").replace(
                                        "Z", "+00:00"
                                    )
                                )
                                time2 = datetime.fromisoformat(
                                    get_row_value(p2, "timestamp").replace(
                                        "Z", "+00:00"
                                    )
                                )
                                time_diff = (time2 - time1).total_seconds()
                                if time_diff > 0:
                                    speeds.append(dist / time_diff)
                            except Exception:
                                pass

                        if len(speeds) >= 2:
                            speed_consistency = float(np.std(speeds))
                    except Exception:
                        pass

                # Position-jump
                position_jump = 0.0
                if i > 0 and speed > 0:
                    try:
                        prev_pos = positions[i - 1]
                        prev_lat = get_row_value(prev_pos, "position_lat")
                        prev_lng = get_row_value(prev_pos, "position_lng")
                        prev_time_str = get_row_value(prev_pos, "timestamp")

                        curr_time = datetime.fromisoformat(
                            timestamp_str.replace("Z", "+00:00")
                        )
                        prev_time = datetime.fromisoformat(
                            prev_time_str.replace("Z", "+00:00")
                        )
                        time_diff = (curr_time - prev_time).total_seconds()

                        if time_diff > 0:
                            # Förväntad avstånd
                            expected_distance = speed * time_diff

                            # Faktiskt avstånd
                            R = 6371000
                            phi1 = math.radians(prev_lat)
                            phi2 = math.radians(orig_lat)
                            delta_phi = math.radians(orig_lat - prev_lat)
                            delta_lambda = math.radians(orig_lng - prev_lng)
                            a = (
                                math.sin(delta_phi / 2) ** 2
                                + math.cos(phi1)
                                * math.cos(phi2)
                                * math.sin(delta_lambda / 2) ** 2
                            )
                            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                            actual_distance = R * c

                            position_jump = abs(actual_distance - expected_distance)
                    except Exception:
                        pass

                features.extend([curvature, speed_consistency, position_jump])

                # Matchning features (närhetsmatchning med människaspår för hundspår)
                distance_to_human = 999.0
                direction_to_human = 0.0
                human_track_speed = 0.0
                human_track_exists = 0.0

                if track_type == "dog":
                    # Hitta människaspår i all_tracks_data
                    human_track_data = None
                    for other_track_data in all_tracks_data:
                        if other_track_data["track_type"] == "human":
                            human_track_data = other_track_data
                            break

                    if human_track_data and human_track_data["positions"]:
                        human_track_exists = 1.0

                        # Hitta närmaste människaspår-position
                        try:
                            dog_time = datetime.fromisoformat(
                                timestamp_str.replace("Z", "+00:00")
                            )
                            nearest_human_pos = None
                            nearest_distance = 999.0

                            for human_pos in human_track_data["positions"]:
                                human_lat = get_row_value(human_pos, "position_lat")
                                human_lng = get_row_value(human_pos, "position_lng")
                                human_time_str = get_row_value(human_pos, "timestamp")

                                if not all([human_lat, human_lng, human_time_str]):
                                    continue

                                # Beräkna avstånd
                                R = 6371000
                                phi1 = math.radians(orig_lat)
                                phi2 = math.radians(human_lat)
                                delta_phi = math.radians(human_lat - orig_lat)
                                delta_lambda = math.radians(human_lng - orig_lng)
                                a = (
                                    math.sin(delta_phi / 2) ** 2
                                    + math.cos(phi1)
                                    * math.cos(phi2)
                                    * math.sin(delta_lambda / 2) ** 2
                                )
                                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                                distance = R * c

                                # Prioritera positioner nära i tid
                                try:
                                    human_time = datetime.fromisoformat(
                                        human_time_str.replace("Z", "+00:00")
                                    )
                                    time_diff = abs(
                                        (dog_time - human_time).total_seconds()
                                    )
                                    combined_score = distance + (time_diff * 0.1)

                                    if combined_score < nearest_distance:
                                        nearest_distance = distance
                                        nearest_human_pos = {
                                            "lat": human_lat,
                                            "lng": human_lng,
                                            "timestamp": human_time_str,
                                        }

                                        # Beräkna hastighet på människaspår
                                        human_idx = human_track_data["positions"].index(
                                            human_pos
                                        )
                                        if human_idx > 0:
                                            prev_human = human_track_data["positions"][
                                                human_idx - 1
                                            ]
                                            prev_human_lat = get_row_value(
                                                prev_human, "position_lat"
                                            )
                                            prev_human_lng = get_row_value(
                                                prev_human, "position_lng"
                                            )
                                            prev_human_time_str = get_row_value(
                                                prev_human, "timestamp"
                                            )
                                            if (
                                                prev_human_lat
                                                and prev_human_lng
                                                and prev_human_time_str
                                            ):
                                                prev_human_time = (
                                                    datetime.fromisoformat(
                                                        prev_human_time_str.replace(
                                                            "Z", "+00:00"
                                                        )
                                                    )
                                                )
                                                R = 6371000
                                                phi1_h = math.radians(prev_human_lat)
                                                phi2_h = math.radians(human_lat)
                                                delta_phi_h = math.radians(
                                                    human_lat - prev_human_lat
                                                )
                                                delta_lambda_h = math.radians(
                                                    human_lng - prev_human_lng
                                                )
                                                a_h = (
                                                    math.sin(delta_phi_h / 2) ** 2
                                                    + math.cos(phi1_h)
                                                    * math.cos(phi2_h)
                                                    * math.sin(delta_lambda_h / 2) ** 2
                                                )
                                                c_h = 2 * math.atan2(
                                                    math.sqrt(a_h), math.sqrt(1 - a_h)
                                                )
                                                human_dist = R * c_h
                                                human_time_diff = (
                                                    human_time - prev_human_time
                                                ).total_seconds()
                                                if human_time_diff > 0:
                                                    human_track_speed = (
                                                        human_dist / human_time_diff
                                                    )
                                except Exception:
                                    if distance < nearest_distance:
                                        nearest_distance = distance
                                        nearest_human_pos = {
                                            "lat": human_lat,
                                            "lng": human_lng,
                                        }

                            if nearest_human_pos:
                                distance_to_human = nearest_distance

                                # Beräkna riktning mot människaspår
                                try:
                                    human_lat = nearest_human_pos["lat"]
                                    human_lng = nearest_human_pos["lng"]
                                    lat1_rad = math.radians(orig_lat)
                                    lat2_rad = math.radians(human_lat)
                                    delta_lng = math.radians(human_lng - orig_lng)
                                    y = math.sin(delta_lng) * math.cos(lat2_rad)
                                    x = math.cos(lat1_rad) * math.sin(
                                        lat2_rad
                                    ) - math.sin(lat1_rad) * math.cos(
                                        lat2_rad
                                    ) * math.cos(delta_lng)
                                    direction_to_human = math.degrees(math.atan2(y, x))
                                    if direction_to_human < 0:
                                        direction_to_human += 360
                                except Exception:
                                    pass
                        except Exception:
                            pass

                features.extend(
                    [
                        distance_to_human,
                        direction_to_human,
                        human_track_speed,
                        human_track_exists,
                    ]
                )

                # Förutsäg korrigeringsavstånd
                X = np.array([features])
                X_scaled = scaler.transform(X)
                predicted_correction_distance = model.predict(X_scaled)[0]

                # Spara förutsägelsen för rolling statistics
                predicted_corrections_history.append(predicted_correction_distance)

                # Beräkna förutsagd korrigerad position
                predicted_corr_lat = orig_lat
                predicted_corr_lng = orig_lng
                if predicted_correction_distance > 0.1:
                    correction_factor = min(predicted_correction_distance / 10.0, 0.5)
                    predicted_corr_lat = (
                        orig_lat + (mean_lat - orig_lat) * correction_factor
                    )
                    predicted_corr_lng = (
                        orig_lng + (mean_lng - orig_lng) * correction_factor
                    )

                # Beräkna faktiskt korrigeringsavstånd
                # Om positionen har corrected_lat/lng → beräkna avstånd
                # Om positionen är verified='correct' men INTE flyttad → 0 m (stämde från början)
                actual_correction_distance = None
                was_approved_as_is = False  # True om godkänd utan flytt
                actual_corr_position = None

                if actual_corr_lat is not None and actual_corr_lng is not None:
                    # Position har flyttats manuellt
                    positions_with_actual_corrections += 1
                    R = 6371000
                    phi1 = math.radians(orig_lat)
                    phi2 = math.radians(actual_corr_lat)
                    delta_phi = math.radians(actual_corr_lat - orig_lat)
                    delta_lambda = math.radians(actual_corr_lng - orig_lng)
                    a = (
                        math.sin(delta_phi / 2) ** 2
                        + math.cos(phi1)
                        * math.cos(phi2)
                        * math.sin(delta_lambda / 2) ** 2
                    )
                    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                    actual_correction_distance = R * c
                    actual_corr_position = {
                        "lat": float(actual_corr_lat),
                        "lng": float(actual_corr_lng),
                    }
                elif (verified_status or "").strip().lower() == "correct":
                    # Position godkänd men INTE flyttad → original stämde, 0 m korrigering
                    positions_with_actual_corrections += 1
                    actual_correction_distance = 0.0
                    was_approved_as_is = True
                    actual_corr_position = {
                        "lat": orig_lat,
                        "lng": orig_lng,
                    }  # "Rätt" position = original

                # Beräkna avstånd mellan förutsagd och faktisk korrigering
                prediction_error = None
                if actual_correction_distance is not None:
                    prediction_error = abs(
                        predicted_correction_distance - actual_correction_distance
                    )

                all_predictions.append(
                    {
                        "position_id": pos_id,
                        "track_id": track_id,
                        "track_name": track_name,
                        "track_type": track_type,
                        "timestamp": timestamp_str,
                        "original_position": {"lat": orig_lat, "lng": orig_lng},
                        "predicted_correction_distance_meters": float(
                            predicted_correction_distance
                        ),
                        "predicted_corrected_position": {
                            "lat": float(predicted_corr_lat),
                            "lng": float(predicted_corr_lng),
                        },
                        "actual_correction_distance_meters": (
                            float(actual_correction_distance)
                            if actual_correction_distance is not None
                            else None
                        ),
                        "actual_corrected_position": actual_corr_position,
                        "was_approved_as_is": was_approved_as_is,
                        "prediction_error_meters": (
                            float(prediction_error)
                            if prediction_error is not None
                            else None
                        ),
                        "verified_status": verified_status,
                        "gps_accuracy": float(accuracy) if accuracy else None,
                    }
                )
                total_positions += 1

        # Beräkna statistik
        predicted_distances = [
            p["predicted_correction_distance_meters"] for p in all_predictions
        ]
        actual_distances = [
            p["actual_correction_distance_meters"]
            for p in all_predictions
            if p["actual_correction_distance_meters"] is not None
        ]
        prediction_errors = [
            p["prediction_error_meters"]
            for p in all_predictions
            if p["prediction_error_meters"] is not None
        ]

        statistics = {
            "total_positions": total_positions,
            "positions_with_actual_corrections": positions_with_actual_corrections,
            "positions_without_corrections": (
                total_positions - positions_with_actual_corrections
            ),
            "predicted_corrections": {
                "mean_meters": float(np.mean(predicted_distances)),
                "max_meters": float(np.max(predicted_distances)),
                "min_meters": float(np.min(predicted_distances)),
                "median_meters": float(np.median(predicted_distances)),
            },
        }

        if actual_distances:
            statistics["actual_corrections"] = {
                "mean_meters": float(np.mean(actual_distances)),
                "max_meters": float(np.max(actual_distances)),
                "min_meters": float(np.min(actual_distances)),
                "median_meters": float(np.median(actual_distances)),
            }

        if prediction_errors:
            statistics["prediction_accuracy"] = {
                "mean_error_meters": float(np.mean(prediction_errors)),
                "max_error_meters": float(np.max(prediction_errors)),
                "median_error_meters": float(np.median(prediction_errors)),
            }

        # Spara till JSON-fil
        predictions_dir = Path(__file__).parent.parent / "ml" / "predictions"
        predictions_dir.mkdir(exist_ok=True)

        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        track_names_str = "_".join(
            [
                "".join(
                    c if c.isalnum() or c in ("-", "_") else "_"
                    for c in td["track_name"]
                )
                for td in all_tracks_data
            ]
        )
        filename = f"predictions_{track_names_str}_{'_'.join(map(str, track_id_list))}_{timestamp_str}.json"
        filepath = predictions_dir / filename

        result = {
            "track_ids": track_id_list,
            "track_names": [td["track_name"] for td in all_tracks_data],
            "prediction_timestamp": datetime.now().isoformat(),
            "statistics": statistics,
            "predictions": all_predictions,
        }

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        return {
            "status": "success",
            "message": f"Förutsägelser genererade för {total_positions} positioner från {len(track_id_list)} spår",
            "filepath": str(filepath.relative_to(Path(__file__).parent.parent)),
            "statistics": statistics,
            "predictions_count": len(all_predictions),
            "data": result,  # Inkludera full data för direkt användning
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        raise HTTPException(
            status_code=500,
            detail=f"Fel vid ML-förutsägelse: {str(e)}\n\n{traceback.format_exc()}",
        )


@app.get("/ml/feedback-stats")
@app.get("/api/ml/feedback-stats")  # Stöd för frontend
def ml_feedback_stats(
    track_id: Optional[int] = Query(None, description="Filtrera på track_id"),
):
    """
    Räkna hur många positioner som har verified_status correct/incorrect/pending.
    Använd för att kontrollera att din feedback (korrekt/felaktig) finns kvar i databasen.
    """
    try:
        conn = get_db()
        cursor = get_cursor(conn)
        placeholder = "%s" if DATABASE_URL else "?"
        if track_id is not None:
            execute_query(
                cursor,
                f"""
                SELECT verified_status, COUNT(*) as n
                FROM track_positions
                WHERE track_id = {placeholder}
                GROUP BY verified_status
                """,
                (track_id,),
            )
        else:
            execute_query(
                cursor,
                """
                SELECT verified_status, COUNT(*) as n
                FROM track_positions
                GROUP BY verified_status
                """,
            )
        rows = cursor.fetchall()
        conn.close()

        counts = {"correct": 0, "incorrect": 0, "pending": 0}
        for r in rows:
            status = (get_row_value(r, "verified_status") or "pending").strip().lower()
            n = int(get_row_value(r, "n") or 0)
            if status in counts:
                counts[status] = n

        total = sum(counts.values())
        return {
            "status": "success",
            "track_id": track_id,
            "correct": counts["correct"],
            "incorrect": counts["incorrect"],
            "pending": counts["pending"],
            "total": total,
        }
    except Exception as e:
        import traceback

        raise HTTPException(
            status_code=500,
            detail=f"Kunde inte hämta feedback-statistik: {str(e)}\n{traceback.format_exc()}",
        )


@app.get("/ml/predictions")
@app.get("/api/ml/predictions")  # Stöd för frontend som använder /api prefix
def list_ml_predictions():
    """Lista alla sparade ML-förutsägelser. Returnerar tom lista om ml/predictions saknas (t.ex. Railway ephemeral)."""
    try:
        base = Path(__file__).resolve().parent.parent
        predictions_dir = base / "ml" / "predictions"
        predictions_dir.mkdir(parents=True, exist_ok=True)

        predictions = []
        for filepath in sorted(
            predictions_dir.glob("predictions_*.json"), reverse=True
        ):
            try:
                stat = filepath.stat()
                predictions.append(
                    {
                        "filename": filepath.name,
                        "filepath": str(filepath.relative_to(base)),
                        "size_bytes": stat.st_size,
                        "created": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    }
                )
            except Exception:
                pass

        return {
            "status": "success",
            "predictions": predictions,
            "count": len(predictions),
        }

    except Exception as e:
        import traceback
        import logging

        logging.getLogger("uvicorn.error").warning(
            "list_ml_predictions failed (returning []): %s\n%s",
            e,
            traceback.format_exc(),
        )
        return {"status": "success", "predictions": [], "count": 0}


@app.get("/ml/predictions/{filename}")
@app.get("/api/ml/predictions/{filename}")  # Stöd för frontend som använder /api prefix
def get_ml_prediction(filename: str):
    """Hämta en specifik ML-förutsägelse från fil. Mergar in ML-feedback från ml_prediction_feedback."""
    try:
        predictions_dir = Path(__file__).parent.parent / "ml" / "predictions"
        filepath = predictions_dir / filename

        if not filepath.exists():
            raise HTTPException(
                status_code=404, detail=f"Förutsägelse '{filename}' hittades inte"
            )

        # Säkerhetskontroll - bara tillåt JSON-filer i predictions-mappen
        if not filename.startswith("predictions_") or not filename.endswith(".json"):
            raise HTTPException(
                status_code=400, detail="Ogiltigt filnamn för förutsägelse"
            )

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Merga in ML-feedback (ändrar INTE grunddata – bara vad som visas för denna förutsägelse)
        try:
            conn = get_db()
            cursor = get_cursor(conn)
            ph = "%s" if DATABASE_URL else "?"
            execute_query(
                cursor,
                f"SELECT position_id, verified_status FROM ml_prediction_feedback WHERE prediction_filename = {ph}",
                (filename,),
            )
            rows = cursor.fetchall()
            conn.close()
            feedback_map = {
                get_row_value(r, "position_id"): get_row_value(r, "verified_status")
                for r in rows
            }
            if feedback_map and data.get("predictions"):
                for p in data["predictions"]:
                    pid = p.get("position_id")
                    if pid in feedback_map:
                        p["verified_status"] = feedback_map[pid]
        except Exception:
            pass  # Om tabell saknas eller DB ej tillgänglig, använd filens data

        return {"status": "success", "data": data}

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        raise HTTPException(
            status_code=500,
            detail=f"Fel vid läsning av förutsägelse: {str(e)}\n\n{traceback.format_exc()}",
        )


@app.put("/ml/predictions/{filename}/feedback/{position_id}")
@app.put("/api/ml/predictions/{filename}/feedback/{position_id}")  # Stöd för frontend
def update_prediction_feedback(
    filename: str,
    position_id: int,
    verified_status: str = Body(..., embed=True),
):
    """
    Uppdatera ML-feedback för en förutsägelse.
    Sparas i ml_prediction_feedback – ändrar INTE track_positions (grunddata).
    """
    try:
        # Säkerställ att ml_prediction_feedback finns (t.ex. efter ny deploy)
        try:
            init_db()
        except Exception:
            pass

        if verified_status not in ["correct", "incorrect", "pending"]:
            raise HTTPException(
                status_code=400,
                detail="verified_status måste vara 'correct', 'incorrect' eller 'pending'",
            )

        conn = get_db()
        cursor = get_cursor(conn)
        ph = "%s" if DATABASE_URL else "?"
        now = datetime.now().isoformat()

        # Verifiera att positionen finns (referensintegritet)
        execute_query(
            cursor,
            f"SELECT 1 FROM track_positions WHERE id = {ph}",
            (position_id,),
        )
        if cursor.fetchone() is None:
            conn.close()
            raise HTTPException(
                status_code=404, detail=f"Position {position_id} hittades inte"
            )

        if DATABASE_URL:
            cursor.execute(
                """
                INSERT INTO ml_prediction_feedback (prediction_filename, position_id, verified_status, created_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (prediction_filename, position_id)
                DO UPDATE SET verified_status = EXCLUDED.verified_status, created_at = EXCLUDED.created_at
                """,
                (filename, position_id, verified_status, now),
            )
        else:
            # SQLite: delete + insert för upsert (saknar ON CONFLICT)
            cursor.execute(
                "DELETE FROM ml_prediction_feedback WHERE prediction_filename = ? AND position_id = ?",
                (filename, position_id),
            )
            cursor.execute(
                "INSERT INTO ml_prediction_feedback (prediction_filename, position_id, verified_status, created_at) VALUES (?, ?, ?, ?)",
                (filename, position_id, verified_status, now),
            )

        conn.commit()
        conn.close()

        return {
            "status": "success",
            "message": f"ML-feedback uppdaterad för position {position_id}",
            "position_id": position_id,
            "verified_status": verified_status,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        raise HTTPException(
            status_code=500,
            detail=f"Fel vid uppdatering av feedback: {str(e)}\n\n{traceback.format_exc()}",
        )


@app.post("/ml/predictions/{filename}/auto-feedback")
@app.post("/api/ml/predictions/{filename}/auto-feedback")
def auto_feedback_by_error(
    filename: str,
    threshold: float = Query(
        0.8,
        ge=0.1,
        le=5.0,
        description="Felmarginal i meter – under = korrekt, över = felaktig",
    ),
):
    """
    Auto-godkänn baserat på prediction error.
    För positioner med faktisk korrigering: fel < threshold → correct, annars → incorrect.
    Uppdaterar databasen så modellen får bättre träningsdata över tid.
    """
    try:
        # Säkerställ att ml_prediction_feedback finns (t.ex. efter ny deploy)
        try:
            init_db()
        except Exception:
            pass

        predictions_dir = Path(__file__).parent.parent / "ml" / "predictions"
        filepath = predictions_dir / filename
        if not filepath.exists() or not (
            filename.startswith("predictions_") and filename.endswith(".json")
        ):
            raise HTTPException(
                status_code=404, detail=f"Förutsägelse '{filename}' hittades inte"
            )

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        predictions = data.get("predictions") or []
        marked_correct = 0
        marked_incorrect = 0
        skipped = 0
        updates = []  # [(position_id, verified_status), ...]

        for p in predictions:
            pos_id = p.get("position_id")
            actual = p.get("actual_correction_distance_meters")
            predicted = p.get("predicted_correction_distance_meters")

            if actual is None or pos_id is None:
                skipped += 1
                continue

            err = abs((predicted or 0) - actual)
            new_status = "correct" if err < threshold else "incorrect"
            updates.append((pos_id, new_status))
            if new_status == "correct":
                marked_correct += 1
            else:
                marked_incorrect += 1

        if not updates:
            return {
                "status": "success",
                "message": "Inga positioner med faktisk korrigering att uppdatera. Verifiera först i TestLab.",
                "marked_correct": 0,
                "marked_incorrect": 0,
                "skipped": skipped,
                "total_with_actual": 0,
            }

        conn = get_db()
        cursor = get_cursor(conn)
        now = datetime.now().isoformat()
        if DATABASE_URL:
            for pos_id, status in updates:
                cursor.execute(
                    """
                    INSERT INTO ml_prediction_feedback (prediction_filename, position_id, verified_status, created_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (prediction_filename, position_id)
                    DO UPDATE SET verified_status = EXCLUDED.verified_status, created_at = EXCLUDED.created_at
                    """,
                    (filename, pos_id, status, now),
                )
        else:
            for pos_id, status in updates:
                cursor.execute(
                    "DELETE FROM ml_prediction_feedback WHERE prediction_filename = ? AND position_id = ?",
                    (filename, pos_id),
                )
                cursor.execute(
                    "INSERT INTO ml_prediction_feedback (prediction_filename, position_id, verified_status, created_at) VALUES (?, ?, ?, ?)",
                    (filename, pos_id, status, now),
                )
        conn.commit()
        conn.close()

        return {
            "status": "success",
            "message": f"Uppdaterade {len(updates)} positioner i ML-feedback (tröskel {threshold}m). Grunddata oförändrad.",
            "marked_correct": marked_correct,
            "marked_incorrect": marked_incorrect,
            "skipped": skipped,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        raise HTTPException(
            status_code=500, detail=str(e) + "\n" + traceback.format_exc()
        )


@app.get("/ml/export-feedback")
@app.get("/api/ml/export-feedback")  # Stöd för frontend
def export_feedback_data(
    download: bool = Query(False, description="Returnera fil för nedladdning"),
):
    """
    Exportera all data med feedback för ML-träning.
    Inkluderar både manuellt korrigerade spår och ML-förutsägelser med feedback.
    """
    try:
        from datetime import datetime
        import json

        conn = get_db()
        cursor = get_cursor(conn)

        # Hämta alla positioner med korrigeringar eller feedback
        # Logik:
        # - Alla positioner med faktisk korrigering (corrected_lat/lng) → Inkludera ALLTID
        #   (Feedback "felaktig" betyder bara att ML-förutsägelsen var fel, inte att den faktiska korrigeringen är fel)
        # - Positioner utan faktisk korrigering men med feedback "correct" → Inkludera (använd ML-förutsägelsen)
        # - Positioner utan faktisk korrigering och feedback "incorrect" → Hoppa över (vi vet inte vad rätt svar är)
        execute_query(
            cursor,
            """
            SELECT 
                tp.id,
                tp.track_id,
                t.name as track_name,
                t.track_type,
                tp.timestamp,
                tp.verified_status,
                tp.position_lat as original_lat,
                tp.position_lng as original_lng,
                tp.corrected_lat,
                tp.corrected_lng,
                tp.accuracy,
                tp.annotation_notes,
                tp.environment
            FROM track_positions tp
            JOIN tracks t ON tp.track_id = t.id
            WHERE (
                (tp.corrected_lat IS NOT NULL AND tp.corrected_lng IS NOT NULL)
                OR tp.verified_status = 'correct'
            )
            ORDER BY tp.track_id, tp.timestamp
            """,
        )

        rows = cursor.fetchall()
        conn.close()

        # Konvertera till JSON-format
        export_data = []
        for row in rows:
            orig_lat = get_row_value(row, "original_lat")
            orig_lng = get_row_value(row, "original_lng")
            corr_lat = get_row_value(row, "corrected_lat")
            corr_lng = get_row_value(row, "corrected_lng")
            verified_status = get_row_value(row, "verified_status") or "pending"

            # Beräkna correction_distance om korrigering finns
            correction_distance = None
            if corr_lat and corr_lng:
                correction_distance = haversine_meters(
                    LatLng(lat=orig_lat, lng=orig_lng),
                    LatLng(lat=corr_lat, lng=corr_lng),
                )

            export_data.append(
                {
                    "id": get_row_value(row, "id"),
                    "track_id": get_row_value(row, "track_id"),
                    "track_name": get_row_value(row, "track_name"),
                    "track_type": get_row_value(row, "track_type"),
                    "timestamp": get_row_value(row, "timestamp"),
                    "verified_status": verified_status,
                    "original_position": {"lat": orig_lat, "lng": orig_lng},
                    "corrected_position": (
                        {"lat": corr_lat, "lng": corr_lng}
                        if corr_lat and corr_lng
                        else None
                    ),
                    "correction_distance_meters": correction_distance,
                    "accuracy": get_row_value(row, "accuracy"),
                    "annotation_notes": get_row_value(row, "annotation_notes") or "",
                    "environment": get_row_value(row, "environment"),
                }
            )

        # Lägg till ML-förutsägelser markerade som "correct" från predictions-filer
        # Använder ml_prediction_feedback (ändrar INTE track_positions – grunddata oförändrad)
        predictions_dir = Path(__file__).parent.parent / "ml" / "predictions"
        if predictions_dir.exists():
            # Hämta all ML-feedback för att merga in
            feedback_map = {}  # filename -> {position_id -> verified_status}
            try:
                conn2 = get_db()
                cur2 = get_cursor(conn2)
                ph = "%s" if DATABASE_URL else "?"
                execute_query(
                    cur2,
                    "SELECT prediction_filename, position_id, verified_status FROM ml_prediction_feedback",
                    None,
                )
                for r in cur2.fetchall():
                    fn = get_row_value(r, "prediction_filename")
                    pid = get_row_value(r, "position_id")
                    vs = get_row_value(r, "verified_status")
                    if fn not in feedback_map:
                        feedback_map[fn] = {}
                    feedback_map[fn][pid] = vs
                conn2.close()
            except Exception:
                pass

            for pred_file in predictions_dir.glob("predictions_*.json"):
                try:
                    with open(pred_file, "r", encoding="utf-8") as f:
                        pred_data = json.load(f)

                    if pred_data.get("predictions"):
                        for pred in pred_data["predictions"]:
                            # Merga in ML-feedback (överstyr filens verified_status)
                            verified_status = pred.get("verified_status")
                            if pred_file.name in feedback_map:
                                pid = pred.get("position_id")
                                if pid in feedback_map[pred_file.name]:
                                    verified_status = feedback_map[pred_file.name][pid]

                            # Bara inkludera positioner markerade som "correct" som saknar human corrected_position
                            # Då används ML-förutsägelsen som träningsdata – modellen lär sig av sina bra gissningar
                            if (
                                verified_status == "correct"
                                and pred.get("predicted_corrected_position")
                                and not pred.get("actual_corrected_position")
                            ):
                                export_data.append(
                                    {
                                        "id": pred.get("position_id"),
                                        "track_id": pred_data.get("track_id"),
                                        "track_name": pred_data.get("track_name"),
                                        "track_type": pred_data.get("track_type"),
                                        "timestamp": pred.get("timestamp"),
                                        "verified_status": "correct",
                                        "original_position": pred.get(
                                            "original_position"
                                        ),
                                        "corrected_position": pred.get(
                                            "predicted_corrected_position"
                                        ),
                                        "correction_distance_meters": pred.get(
                                            "predicted_correction_distance_meters"
                                        ),
                                        "accuracy": pred.get("gps_accuracy"),
                                        "annotation_notes": "ML-förutsägelse markerad som korrekt (ej i grunddata)",
                                        "environment": None,
                                    }
                                )
                except Exception as e:
                    print(f"Kunde inte läsa predictions-fil {pred_file.name}: {e}")
                    continue

        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"ml_feedback_export_{timestamp_str}.json"
        filepath = Path(__file__).parent.parent / "ml" / "data" / filename

        # Skapa data-mappen om den inte finns
        filepath.parent.mkdir(parents=True, exist_ok=True)

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False)

        if download:
            body = json.dumps(export_data, indent=2, ensure_ascii=False).encode("utf-8")
            return Response(
                content=body,
                media_type="application/json",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "X-Export-Filename": filename,
                    "X-Export-Count": str(len(export_data)),
                },
            )

        return {
            "status": "success",
            "message": f"Exporterade {len(export_data)} positioner med feedback",
            "filepath": str(filepath.relative_to(Path(__file__).parent.parent)),
            "count": len(export_data),
            "filename": filename,
        }

    except Exception as e:
        import traceback

        raise HTTPException(
            status_code=500,
            detail=f"Fel vid export av feedback: {str(e)}\n\n{traceback.format_exc()}",
        )
