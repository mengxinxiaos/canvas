"""Tests use disposable SQLite databases and dummy configuration, never real APIs."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("SECRET_KEY", "test-only-key-not-for-deployment")
os.environ.setdefault("CORS_ORIGINS", "http://localhost")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("MEDIA_ROOT", "/tmp/canvas-test-media")
