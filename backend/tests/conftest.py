import os
import tempfile

# 앱을 import 하기 전에 테스트용 임시 DB 를 지정합니다. (개발용 DB 는 절대 건드리지 않음)
_TMP = tempfile.mkdtemp(prefix="scamcut-test-")
os.environ["SCAMCUT_NO_WARMUP"] = "1"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP.replace(os.sep, '/')}/test.db"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def incident(client):
    return client.post("/api/incidents", json={"title": "테스트 사건", "memo": "메모"}).json()


def make_evidence(client, incident_id=None, **over):
    body = {"channel": "sms", "sender": "02-1234-5678", "occurred_at": "2026-11-04T09:12", "content": "테스트 내용"}
    if incident_id:
        body["incident_id"] = incident_id
    body.update(over)
    return client.post("/api/evidence", json=body)
