# Use Python 3.11 slim image
FROM python:3.11-slim

# Install system dependencies including SQLite
RUN apt-get update && apt-get install -y \
    sqlite3 \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./backend/

# Expose port (Railway will set PORT env var)
EXPOSE 8000

# Run the application (use shell form to allow environment variable expansion)
CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}

