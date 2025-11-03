# API-dokumentation – Dogtracks Geofence Kit

Bas-URL (lokalt): `http://localhost:8000`

## Hälsa

GET `/ping`

Svar:
```json
{"status": "ok"}
```

## Geofences

### Skapa geofence
POST `/geofences`

Body (exempel – cirkel):
```json
{
  "name": "Parken",
  "geofence": {
    "type": "circle",
    "center": { "lat": 59.334, "lng": 18.066 },
    "radius_m": 50
  }
}
```

Body (exempel – polygon):
```json
{
  "name": "Ruta",
  "geofence": {
    "type": "polygon",
    "vertices": [
      {"lat": 59.334, "lng": 18.066},
      {"lat": 59.3345, "lng": 18.067},
      {"lat": 59.3342, "lng": 18.068}
    ]
  }
}
```

Svar:
```json
{
  "id": 1,
  "name": "Parken",
  "geofence": { "type": "circle", "center": {"lat": 59.334, "lng": 18.066}, "radius_m": 50 }
}
```

### Lista geofences
GET `/geofences`

Svar:
```json
[
  {
    "id": 1,
    "name": "Parken",
    "geofence": { "type": "circle", "center": {"lat": 59.334, "lng": 18.066}, "radius_m": 50 }
  }
]
```

### Ta bort geofence
DELETE `/geofences/{id}`

Svar:
```json
{"deleted": 1}
```

## Evaluate – position i förhållande till geofences

POST `/evaluate`

Body:
```json
{
  "position": { "lat": 59.3341, "lng": 18.0665 }
}
```

Svar (exempel):
```json
{
  "position": {"lat": 59.3341, "lng": 18.0665},
  "results": [
    { "geofence_id": 1, "name": "Parken", "inside": true }
  ]
}
```

## Snabbstart lokalt

```bash
cd backend
pip install fastapi uvicorn pydantic
uvicorn main:app --reload
```

Öppna `http://localhost:8000/docs` för interaktiv dokumentation (Swagger UI).



