"""SCAM CUT AI 백엔드 (FastAPI)."""
import logging
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from .analyzers import REGISTRY
from .config import APP_VERSION, CORS_ORIGINS, IS_SQLITE
from .db import SessionLocal, init_db
from .errors import ApiError
from .routers import analysis, auth, data, evidence, incidents
from .services.analysis_runner import fail_stale_jobs

log = logging.getLogger("scamcut")


def _warm_up_models() -> None:
    """첫 분석 요청이 느려지지 않도록 모델을 미리 메모리에 올립니다. (파일이 없으면 건너뜀)"""
    try:
        from .ml.encoder import get_encoder
        from .ml.heads import load_heads, weights_present

        enc = get_encoder()
        if enc.files_present() and weights_present():
            enc.load()
            load_heads()
            log.info("AI 모델 준비 완료")
    except Exception as e:  # 준비 실패는 분석 요청 시 안내 메시지로 처리
        log.warning("AI 모델 사전 로딩 실패: %s", type(e).__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if not os.getenv("SCAMCUT_NO_WARMUP"):
        threading.Thread(target=_warm_up_models, daemon=True).start()
    n = fail_stale_jobs()
    if n:
        log.warning("서버 재시작으로 중단된 분석 작업 %d건을 실패 처리했습니다.", n)
    yield


app = FastAPI(title="SCAM CUT AI API", version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (incidents.router, evidence.router, analysis.router, data.router, auth.router):
    app.include_router(r)


# ------------------------------------------------------------------ 오류 처리
def _error(status: int, code: str, message: str, fields: list | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "fields": fields or []}})


_FIELD_LABEL = {
    "title": "사건 이름",
    "memo": "메모",
    "content": "내용",
    "sender": "발신자",
    "occurred_at": "발생 일시",
    "channel": "자료 유형",
    "incident_id": "사건",
    "id": "ID",
    "email": "이메일",
    "name": "이름",
    "password": "비밀번호",
}


def _msg(err: dict) -> str:
    t, ctx = err.get("type", ""), err.get("ctx") or {}
    if t in ("string_too_short", "missing"):
        return "필수 입력입니다."
    if t == "string_too_long":
        return f"너무 깁니다. 최대 {ctx.get('max_length')}자까지 입력할 수 있어요."
    if t in ("literal_error", "enum"):
        return "허용되지 않는 값입니다."
    if t == "string_pattern_mismatch":
        return "형식이 올바르지 않습니다."
    if t == "value_error":
        return str(err.get("msg", "")).removeprefix("Value error, ")
    return str(err.get("msg", "올바르지 않은 값입니다."))


@app.exception_handler(ApiError)
async def api_error_handler(_req: Request, exc: ApiError):
    return _error(exc.status, exc.code, exc.message, exc.fields)


@app.exception_handler(RequestValidationError)
async def validation_handler(_req: Request, exc: RequestValidationError):
    fields = []
    for e in exc.errors():
        name = next((str(p) for p in reversed(e["loc"]) if isinstance(p, str) and p not in ("body", "query", "path")), "")
        fields.append({"field": name, "message": f"{_FIELD_LABEL.get(name, name)}: {_msg(e)}" if name else _msg(e)})
    summary = fields[0]["message"] if fields else "입력값이 올바르지 않습니다."
    return _error(422, "VALIDATION_ERROR", summary, fields)


@app.exception_handler(StarletteHTTPException)
async def http_handler(_req: Request, exc: StarletteHTTPException):
    code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
    msg = "요청한 주소를 찾을 수 없습니다." if exc.status_code == 404 else str(exc.detail)
    return _error(exc.status_code, code, msg)


@app.exception_handler(Exception)
async def unhandled_handler(_req: Request, exc: Exception):
    log.error("unhandled error: %s", type(exc).__name__)  # 요청 내용(개인정보)은 기록하지 않음
    return _error(500, "INTERNAL_ERROR", "서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")


# ------------------------------------------------------------------ 상태 확인
@app.get("/api/health")
def health():
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "version": APP_VERSION,
        "database": "sqlite" if IS_SQLITE else "external",
        "analyzers_implemented": sum(1 for a in REGISTRY.values() if a.implemented),
        "analyzers_total": len(REGISTRY),
        "analyzers_ready": sum(1 for a in REGISTRY.values() if a.readiness()[0]),
    }
