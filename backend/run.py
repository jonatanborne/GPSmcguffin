#!/usr/bin/env python3
"""Run script that reads PORT from environment"""
import os
import uvicorn

if __name__ == "__main__":
    import sys
    import os
    # Add backend directory to path so backend.main can be found
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(backend_dir)
    sys.path.insert(0, parent_dir)
    
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port)

