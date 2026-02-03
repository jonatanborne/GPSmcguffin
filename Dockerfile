FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    sqlite3 \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
# Model 20260203: MAE 0.055m, R² 98.5% - ändra denna rad för att tvinga ny ml-kopia
COPY ml/ ./ml/

EXPOSE 8000
CMD ["python3", "/app/backend/run.py"]
