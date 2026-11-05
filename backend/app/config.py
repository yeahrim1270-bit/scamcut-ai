"""환경 설정. 모든 값은 환경변수로 덮어쓸 수 있습니다."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# SQLite는 로컬 개발 전용입니다. 배포 시에는 DATABASE_URL 로 별도 DB를 지정하세요.
DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{(DATA_DIR / 'scamcut.db').as_posix()}"
IS_SQLITE = DATABASE_URL.startswith("sqlite")

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if o.strip()
]

APP_VERSION = "0.3.0"

# 한 번에 가져올 수 있는 최대 항목 수 (localStorage 마이그레이션·백업 복원용)
IMPORT_MAX_ITEMS = 5000
