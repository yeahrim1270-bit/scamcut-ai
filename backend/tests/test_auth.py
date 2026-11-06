"""회원가입 · 로그인 · 로그아웃 테스트."""
from sqlalchemy import select

from app.db import SessionLocal
from app.models import AuthSession, User
from app.routers import auth as auth_router

GOOD = {"email": "Hong@Example.com", "name": "홍길동", "password": "pass1234word"}


def _signup(client, **over):
    return client.post("/api/auth/signup", json={**GOOD, **over})


def test_signup_logs_in_and_sets_secure_cookie(client):
    r = _signup(client)
    assert r.status_code == 201
    u = r.json()
    assert u["email"] == "hong@example.com" and u["name"] == "홍길동"  # 이메일은 소문자로 저장
    assert "password" not in u and "password_hash" not in u
    set_cookie = r.headers["set-cookie"].lower()
    assert "scamcut_session=" in set_cookie and "httponly" in set_cookie and "samesite=lax" in set_cookie
    assert client.get("/api/auth/me").json()["user"]["email"] == "hong@example.com"  # 가입 직후 로그인 상태


def test_password_is_never_stored_in_plain_text(client):
    _signup(client)
    with SessionLocal() as db:
        u = db.scalar(select(User))
        assert "pass1234word" not in u.password_hash and u.password_hash.startswith("scrypt$")
        s = db.scalar(select(AuthSession))
        assert s is not None and len(s.token_hash) == 64  # 세션 토큰도 해시로만 저장


def test_cookie_is_secure_over_https(client):
    r = client.post("/api/auth/signup", json=GOOD, headers={"x-forwarded-proto": "https"})
    assert "secure" in r.headers["set-cookie"].lower()


def test_signup_validation(client):
    for bad, word in [
        ({"email": "not-an-email"}, "이메일"),
        ({"password": "short1"}, "비밀번호"),  # 8자 미만
        ({"password": "onlyletters"}, "영문과 숫자"),
        ({"password": "12345678"}, "영문과 숫자"),
        ({"name": ""}, "이름"),
        ({"name": "가" * 21}, "이름"),
    ]:
        r = _signup(client, **bad)
        assert r.status_code == 422 and word in r.json()["error"]["message"], (bad, r.json())
    assert client.get("/api/auth/me").json()["user"] is None  # 실패한 가입은 로그인되지 않음


def test_duplicate_email_case_insensitive(client):
    assert _signup(client).status_code == 201
    r = _signup(client, email="HONG@example.COM", name="다른사람")
    assert r.status_code == 409 and r.json()["error"]["code"] == "EMAIL_TAKEN"


def test_login_logout_flow(client):
    _signup(client)
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json()["user"] is None

    r = client.post("/api/auth/login", json={"email": "hong@example.com", "password": "pass1234word"})
    assert r.status_code == 200 and r.json()["name"] == "홍길동"
    assert client.get("/api/auth/me").json()["user"]["name"] == "홍길동"

    assert client.post("/api/auth/logout").json() == {"ok": True}
    assert client.get("/api/auth/me").json()["user"] is None
    with SessionLocal() as db:
        assert db.scalar(select(AuthSession)) is None  # 로그아웃하면 서버의 세션도 삭제


def test_login_failures_do_not_reveal_whether_email_exists(client):
    _signup(client)
    client.post("/api/auth/logout")
    wrong_pw = client.post("/api/auth/login", json={"email": "hong@example.com", "password": "wrongpass1"})
    no_user = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrongpass1"})
    assert wrong_pw.status_code == no_user.status_code == 401
    assert wrong_pw.json()["error"] == no_user.json()["error"]  # 메시지·코드가 똑같음
    assert "set-cookie" not in wrong_pw.headers


def test_login_rate_limit(client):
    auth_router._FAILS.clear()
    _signup(client)
    client.post("/api/auth/logout")
    codes = [client.post("/api/auth/login", json={"email": "hong@example.com", "password": f"wrong{i}pass"}).status_code for i in range(7)]
    assert codes[:5] == [401] * 5 and codes[5:] == [429, 429]
    # 차단 중에는 올바른 비밀번호도 거부
    assert client.post("/api/auth/login", json={"email": "hong@example.com", "password": "pass1234word"}).status_code == 429
    auth_router._FAILS.clear()


def test_invalid_or_expired_session_cookie_is_logged_out(client):
    _signup(client)
    client.cookies.clear()  # 가입으로 받은 진짜 쿠키를 지우고 가짜 토큰만 보냄
    client.cookies.set("scamcut_session", "forged-token-value")
    assert client.get("/api/auth/me").json()["user"] is None
    # 세션 만료
    client.cookies.clear()
    _signup(client, email="b@example.com")
    with SessionLocal() as db:
        for s in db.scalars(select(AuthSession)).all():
            s.expires_at = "2000-01-01T00:00:00.000Z"
        db.commit()
    assert client.get("/api/auth/me").json()["user"] is None


# ---- 정규식 회귀 테스트: 이메일에 's' 가 있어도 가입되고, 비밀번호 숫자 검사는 '글자 d' 가 아니라 숫자를 봐야 함
def test_emails_containing_s_are_accepted(client):
    for i, email in enumerate(["tester@example.com", "user.s@sub.example.co.kr", "sss+tag@mail.example.com"]):
        r = client.post("/api/auth/signup", json={"email": email, "name": f"사용자{i}", "password": "abc12345"})
        assert r.status_code == 201, (email, r.json())


def test_invalid_emails_are_rejected(client):
    for email in ["a@b", "a b@c.com", "@example.com", "plain", "a@@b.com"]:
        r = client.post("/api/auth/signup", json={"email": email, "name": "이름", "password": "abc12345"})
        assert r.status_code == 422, email


def test_password_digit_check_looks_for_digits_not_letter_d(client):
    ok = client.post("/api/auth/signup", json={"email": "p1@example.com", "name": "이름", "password": "abc12345"})
    assert ok.status_code == 201  # 'd' 가 없어도 숫자가 있으면 통과
    for pw in ["abcdefgh", "ddddddddd", "12345678", "ABCDEFGH"]:  # 숫자가 없거나 영문이 없으면 거부
        r = client.post("/api/auth/signup", json={"email": f"{pw.lower()}@example.com", "name": "이름", "password": pw})
        assert r.status_code == 422 and "영문과 숫자" in r.json()["error"]["message"], pw
