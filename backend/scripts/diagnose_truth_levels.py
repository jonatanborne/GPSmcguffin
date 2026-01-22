"""
Diagnostiskt script för att undersöka truth levels i databasen
"""
import os
import sys
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor

# Lägg till backend-mappen i path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Ladda .env-fil om den finns
try:
    from dotenv import load_dotenv
    env_path = backend_dir.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()
except ImportError:
    pass

def get_database_url():
    """Hämta DATABASE_URL från environment variables"""
    database_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("DATABASE_PUBLIC_URL")
        or os.getenv("POSTGRES_URL")
    )

    if database_url:
        database_url = database_url.strip()

    return database_url


def get_db_connection():
    """Hämta PostgreSQL-anslutning"""
    database_url = get_database_url()
    if database_url:
        return psycopg2.connect(database_url)
    
    # Fallback till individuella variabler
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST"),
        port=os.getenv("POSTGRES_PORT", "5432"),
        database=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
    )

def haversine_distance_sql(lat1_col, lon1_col, lat2_col, lon2_col):
    """Returnera SQL för att beräkna Haversine-avstånd i meter"""
    return f"""
        6371000 * 2 * ATAN2(
            SQRT(
                POW(SIN(RADIANS({lat2_col} - {lat1_col}) / 2), 2) +
                COS(RADIANS({lat1_col})) * COS(RADIANS({lat2_col})) *
                POW(SIN(RADIANS({lon2_col} - {lon1_col}) / 2), 2)
            ),
            SQRT(1 - (
                POW(SIN(RADIANS({lat2_col} - {lat1_col}) / 2), 2) +
                COS(RADIANS({lat1_col})) * COS(RADIANS({lat2_col})) *
                POW(SIN(RADIANS({lon2_col} - {lon1_col}) / 2), 2)
            ))
        )
    """

def main():
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    print("=" * 60)
    print("DIAGNOSTIK: TRUTH LEVELS OCH KORRIGERINGAR")
    print("=" * 60)
    
    # 1. Kolla hur många positioner har corrected_lat/lng
    cursor.execute("""
        SELECT COUNT(*) as count
        FROM track_positions
        WHERE corrected_lat IS NOT NULL AND corrected_lng IS NOT NULL
    """)
    result = cursor.fetchone()
    corrected_count = result['count'] if result else 0
    print(f"\n1. Positioner med corrected_lat/lng: {corrected_count}")
    
    # 2. Kolla truth_level för dessa
    cursor.execute("""
        SELECT truth_level, COUNT(*) as count
        FROM track_positions
        WHERE corrected_lat IS NOT NULL AND corrected_lng IS NOT NULL
        GROUP BY truth_level
        ORDER BY truth_level
    """)
    print("\n2. Truth levels för positioner med korrigeringar:")
    for row in cursor.fetchall():
        print(f"   {row['truth_level']}: {row['count']} positioner")
    
    # 3. Kolla correction_source
    cursor.execute("""
        SELECT correction_source, COUNT(*) as count
        FROM track_positions
        WHERE corrected_lat IS NOT NULL AND corrected_lng IS NOT NULL
        GROUP BY correction_source
        ORDER BY correction_source
    """)
    print("\n3. Correction source för positioner med korrigeringar:")
    for row in cursor.fetchall():
        print(f"   {row['correction_source']}: {row['count']} positioner")
    
    # 4. Kolla avstånd för positioner med korrigeringar (sample)
    distance_sql = haversine_distance_sql(
        "position_lat", "position_lng", "corrected_lat", "corrected_lng"
    )
    cursor.execute(f"""
        SELECT 
            id,
            truth_level,
            correction_source,
            ({distance_sql}) as distance_meters
        FROM track_positions
        WHERE corrected_lat IS NOT NULL AND corrected_lng IS NOT NULL
        ORDER BY distance_meters DESC
        LIMIT 10
    """)
    print("\n4. Top 10 positioner med störst avstånd (korrigering):")
    for row in cursor.fetchall():
        print(f"   ID {row['id']}: {row['distance_meters']:.2f}m, truth_level={row['truth_level']}, source={row['correction_source']}")
    
    # 5. Kolla hur många som skulle matcha T0-kriterierna
    cursor.execute(f"""
        SELECT COUNT(*) as count
        FROM track_positions
        WHERE corrected_lat IS NOT NULL 
          AND corrected_lng IS NOT NULL
          AND ({distance_sql}) > 1.0
          AND (correction_source IS NULL OR correction_source = 'none')
    """)
    result = cursor.fetchone()
    t0_candidates = result['count'] if result else 0
    print(f"\n5. Positioner som skulle matcha T0-kriterierna (>1m, ingen ml-source): {t0_candidates}")
    
    # 6. Kolla hur många som har truth_level = 'T3' OCH skulle matcha T0
    cursor.execute(f"""
        SELECT COUNT(*) as count
        FROM track_positions
        WHERE corrected_lat IS NOT NULL 
          AND corrected_lng IS NOT NULL
          AND ({distance_sql}) > 1.0
          AND (correction_source IS NULL OR correction_source = 'none')
          AND truth_level = 'T3'
    """)
    result = cursor.fetchone()
    t0_candidates_t3 = result['count'] if result else 0
    print(f"   (Av dessa, hur många har truth_level = 'T3'): {t0_candidates_t3}")
    
    # 7. Kolla alla truth_levels totalt
    cursor.execute("""
        SELECT truth_level, COUNT(*) as count
        FROM track_positions
        GROUP BY truth_level
        ORDER BY truth_level
    """)
    print("\n6. Alla truth levels i databasen:")
    for row in cursor.fetchall():
        print(f"   {row['truth_level']}: {row['count']} positioner")
    
    # 8. Testa SQL-formeln på en specifik position
    cursor.execute("""
        SELECT id, position_lat, position_lng, corrected_lat, corrected_lng
        FROM track_positions
        WHERE corrected_lat IS NOT NULL AND corrected_lng IS NOT NULL
        LIMIT 1
    """)
    test_row = cursor.fetchone()
    if test_row:
        print(f"\n7. Test-exempel (ID {test_row['id']}):")
        print(f"   Original: ({test_row['position_lat']}, {test_row['position_lng']})")
        print(f"   Corrected: ({test_row['corrected_lat']}, {test_row['corrected_lng']})")
        
        # Beräkna avstånd med SQL
        cursor.execute(f"""
            SELECT ({distance_sql}) as distance
            FROM track_positions
            WHERE id = {test_row['id']}
        """)
        sql_result = cursor.fetchone()
        print(f"   SQL-avstånd: {sql_result['distance']:.2f}m" if sql_result else "   SQL-avstånd: ERROR")
    
    cursor.close()
    conn.close()
    
    print("\n" + "=" * 60)
    print("DIAGNOSTIK KLAR")
    print("=" * 60)

if __name__ == "__main__":
    main()
