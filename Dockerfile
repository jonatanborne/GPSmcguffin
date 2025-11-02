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

# Create entrypoint script
RUN echo '#!/bin/sh\nuvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}' > /entrypoint.sh && \
    chmod +x /entrypoint.sh

# Expose port (Railway will set PORT env var)
EXPOSE 8000

# Run the application
ENTRYPOINT ["/entrypoint.sh"]

