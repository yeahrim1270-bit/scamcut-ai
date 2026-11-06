"""회원가입 · 로그인 · 로그아웃 · 내 정보 조회.

로그인 상태는 httpOnly 쿠키(scamcut_session)로 유지합니다. (자바스크립트에서 읽을 수 없음)
"""
import time

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import ApiError
from ..models import User, new_id, now_iso
from ..schemas import LoginIn, SignupIn, UserOut
from ..services.auth import (
    DUMMY_HASH,
    SESSION_DAYS,
    create_session,
    delete_session,
    get_user_by_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE = "scamcut_session"

# 로그인 실패 제한: 같은 (IP, 이메일)에서 10분에 5번 실패하면 잠시 차단
_FAILS: dict[str, list[float]] = {}
_MAX_FAILS, _WINDOW = 5, 600


def _secure(request: Request) -> bool:
    """https 로 접속했을 때만 Secure 쿠키를 씁니다(로컬 http 개발에서도 동작하도록)."""
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto", "").startswith("https")


def _set_cookie(response: Response, request: Request, token: str) -> None:
    response.set_cookie(
        COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax", secure=_secure(request), path="/"
    )


def _key(request: Request, email: str) -> str:
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "?")
    return f"{ip}|{email}"


def _recent_fails(key: str) -> list[float]:
    now = time.time()
    arr = [t for t in _FAILS.get(key, []) if now - t < _WINDOW]
    _FAILS[key] = arr
    return arr


@router.post("/signup", response_model=UserOut, status_code=201)
def signup(data: SignupIn, request: Request, response: Response, db: Session = Depends(get_db)):
    dup = ApiError(409, "EMAIL_TAKEN", "이미 가입된 이메일입니다.", [{"field": "email", "message": "이메일: 이미 가입된 이메일입니다."}])
    if db.scalar(select(User).where(User.email == data.email)) is not None:
        raise dup
    user = User(id=new_id(), email=data.email, name=data.name, password_hash=hash_password(data.password), created_at=now_iso())
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # 동시에 같은 이메일로 가입한 경우
        db.rollback()
        raise dup
    _set_cookie(response, request, create_session(db, user))
    return user


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    key = _key(request, data.email)
    if len(_recent_fails(key)) >= _MAX_FAILS:
        raise ApiError(429, "TOO_MANY_ATTEMPTS", "로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.")
    user = db.scalar(select(User).where(User.email == data.email))
    ok = verify_password(data.password, user.password_hash if user else DUMMY_HASH)
    if not user or not ok:
        _FAILS.setdefault(key, []).append(time.time())
        # 이메일이 없는지 비밀번호가 틀렸는지 구분하지 않고 같은 메시지를 돌려줍니다.
        raise ApiError(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.")
    _FAILS.pop(key, None)
    _set_cookie(response, request, create_session(db, user))
    return user


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    delete_session(db, request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    user = get_user_by_token(db, request.cookies.get(COOKIE))
    return {"user": UserOut.model_validate(user) if user else None}
