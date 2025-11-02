#!/bin/sh
# Entrypoint script for Railway
# Expands PORT environment variable correctly

PORT=${PORT:-8000}
exec uvicorn backend.main:app --host 0.0.0.0 --port "$PORT"

