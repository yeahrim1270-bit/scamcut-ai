"""SQLAlchemy 엔진/세션. SQLite 사용 시 외래 키 제약을 반드시 켭니다."""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATA_DIR, DATABASE_URL, IS_SQLITE


class Base(DeclarativeBase):
    pass


if IS_SQLITE:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
    pool_pre_ping=True,
)

if IS_SQLITE:

    @event.listens_for(engine, "connect")
    def _enable_sqlite_fk(dbapi_connection, _record):  # pragma: no cover - 드라이버 훅
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401  (테이블 등록)

    Base.metadata.create_all(engine)
