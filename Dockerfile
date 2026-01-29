# Stage 1: Fetch Git LFS files so .pkl are real binaries, not pointers
FROM alpine:3.19 AS lfs
RUN apk add --no-cache git git-lfs
WORKDIR /src
COPY . .
RUN git lfs install && git lfs pull

# Stage 2: Application
FROM python:3.11-slim

# Install system dependencies including SQLite
RUN apt-get update && apt-get install -y \
    sqlite3 \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy from LFS stage (ml/ now has real .pkl, not pointers)
COPY --from=lfs /src/backend/ ./backend/
COPY --from=lfs /src/ml/ ./ml/

# Expose port (Railway will set PORT env var)
EXPOSE 8000

# Run the application using Python script that reads PORT
# Use absolute path and python3 explicitly
CMD ["python3", "/app/backend/run.py"]

