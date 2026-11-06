"""계정 인증: 비밀번호 해시(scrypt, 표준 라이브러리)와 로그인 세션.

- 비밀번호는 절대 평문으로 저장하지 않습니다. (솔트 + scrypt)
- 세션 토큰은 DB 에 해시(SHA-256)로만 저장하고, 브라우저에는 httpOnly 쿠키로만 전달합니다.
"""
import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import delete
from sqlalchemy.orm import Session

from ..models import AuthSession, User, now_iso

SESSION_DAYS = 14
_N, _R, _P = 2**14, 8, 1


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${_b64(salt)}${_b64(dk)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, dk = stored.split("$")
        if scheme != "scrypt":
            return False
        calc = hashlib.scrypt(password.encode("utf-8"), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(calc, base64.b64decode(dk))
    except Exception:
        return False


# 존재하지 않는 이메일로 로그인할 때도 같은 시간이 걸리게 해 '가입 여부'를 시간차로 알아내지 못하게 함
DUMMY_HASH = hash_password("timing-equalizer-password")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _iso_in(days: int) -> str:
    t = datetime.now(timezone.utc) + timedelta(days=days)
    return t.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def create_session(db: Session, user: User) -> str:
    db.execute(delete(AuthSession).where(AuthSession.expires_at < now_iso()))  # 만료된 세션 정리
    token = secrets.token_urlsafe(32)
    db.add(AuthSession(token_hash=_token_hash(token), user_id=user.id, created_at=now_iso(), expires_at=_iso_in(SESSION_DAYS)))
    db.commit()
    return token


def get_user_by_token(db: Session, token: Optional[str]) -> Optional[User]:
    if not token:
        return None
    row = db.get(AuthSession, _token_hash(token))
    if row is None:
        return None
    if row.expires_at <= now_iso():
        db.delete(row)
        db.commit()
        return None
    return db.get(User, row.user_id)


def delete_session(db: Session, token: Optional[str]) -> None:
    if not token:
        return
    row = db.get(AuthSession, _token_hash(token))
    if row is not None:
        db.delete(row)
        db.commit()
