"""사건·자료 CRUD, 입력 검증, 관계, 백업/마이그레이션 테스트."""
from conftest import make_evidence


# ------------------------------------------------------------ health
def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["analyzers_total"] == 4 and body["analyzers_implemented"] == 2


# ------------------------------------------------------------ 사건 CRUD
def test_incident_crud(client):
    r = client.post("/api/incidents", json={"title": "  택배 사칭  ", "memo": "처음 메모"})
    assert r.status_code == 201
    inc = r.json()
    assert inc["title"] == "택배 사칭" and len(inc["id"]) >= 6 and inc["evidence_count"] == 0

    assert client.get(f"/api/incidents/{inc['id']}").json()["title"] == "택배 사칭"
    assert [i["id"] for i in client.get("/api/incidents").json()] == [inc["id"]]

    r = client.patch(f"/api/incidents/{inc['id']}", json={"title": "수정됨"})
    assert r.status_code == 200 and r.json()["title"] == "수정됨" and r.json()["memo"] == "처음 메모"

    r = client.delete(f"/api/incidents/{inc['id']}")
    assert r.status_code == 200
    assert client.get(f"/api/incidents/{inc['id']}").status_code == 404
    assert client.get("/api/incidents").json() == []


def test_incident_client_supplied_id_and_conflict(client):
    r = client.post("/api/incidents", json={"id": "abc123xyz", "title": "A"})
    assert r.status_code == 201 and r.json()["id"] == "abc123xyz"
    r = client.post("/api/incidents", json={"id": "abc123xyz", "title": "B"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT"


def test_incident_validation(client):
    r = client.post("/api/incidents", json={"title": "   "})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "VALIDATION_ERROR" and "사건 이름" in err["message"] and err["fields"][0]["field"] == "title"
    assert client.post("/api/incidents", json={"title": "x" * 101}).status_code == 422
    assert client.post("/api/incidents", json={"title": "ok", "id": "bad id!"}).status_code == 422
    assert client.post("/api/incidents", content="not json", headers={"content-type": "application/json"}).status_code == 422


def test_not_found_format(client):
    r = client.get("/api/incidents/nope12345")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
    r = client.get("/api/does-not-exist")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"


# ------------------------------------------------------------ 자료 CRUD
def test_evidence_crud(client, incident):
    r = make_evidence(client, incident["id"], channel="email", sender="a@b.com", content="링크를 눌러 인증하세요")
    assert r.status_code == 201
    ev = r.json()
    assert ev["incident_id"] == incident["id"] and ev["channel"] == "email"

    assert client.get(f"/api/evidence/{ev['id']}").json()["content"] == "링크를 눌러 인증하세요"
    assert client.get(f"/api/incidents/{incident['id']}").json()["evidence_count"] == 1

    r = client.patch(f"/api/evidence/{ev['id']}", json={"content": "수정된 내용", "channel": "call"})
    assert r.status_code == 200 and r.json()["content"] == "수정된 내용" and r.json()["channel"] == "call"
    assert r.json()["sender"] == "a@b.com"  # 보내지 않은 필드는 유지

    assert client.delete(f"/api/evidence/{ev['id']}").status_code == 200
    assert client.get(f"/api/evidence/{ev['id']}").status_code == 404
    assert client.get(f"/api/incidents/{incident['id']}").json()["evidence_count"] == 0


def test_evidence_validation(client, incident):
    assert make_evidence(client, content="").status_code == 422
    assert make_evidence(client, content="x" * 3001).status_code == 422
    assert make_evidence(client, channel="messenger").status_code == 422  # 이전 유형은 API 에서 허용하지 않음
    assert make_evidence(client, channel="fax").status_code == 422
    assert make_evidence(client, occurred_at="어제").status_code == 422
    assert make_evidence(client, occurred_at="2026-13-45T25:61").status_code == 422
    assert make_evidence(client, occurred_at="").status_code == 201  # 시각 미입력 허용
    assert make_evidence(client, occurred_at="2026-11-04T09:12:30Z").status_code == 201
    r = make_evidence(client, "does-not-exist")
    assert r.status_code == 422 and r.json()["error"]["code"] == "INCIDENT_NOT_FOUND"


def test_evidence_relation_move_and_unassign(client, incident):
    other = client.post("/api/incidents", json={"title": "다른 사건"}).json()
    ev = make_evidence(client, incident["id"]).json()

    r = client.patch(f"/api/evidence/{ev['id']}", json={"incident_id": other["id"]})
    assert r.json()["incident_id"] == other["id"]

    r = client.patch(f"/api/evidence/{ev['id']}", json={"incident_id": None})  # 미분류로
    assert r.json()["incident_id"] is None
    assert [e["id"] for e in client.get("/api/evidence", params={"unassigned": True}).json()] == [ev["id"]]

    r = client.patch(f"/api/evidence/{ev['id']}", json={"incident_id": "nope12345"})
    assert r.status_code == 422


def test_list_evidence_filters_and_chronological_order(client, incident):
    make_evidence(client, incident["id"], occurred_at="2026-11-04T15:00", content="C")
    make_evidence(client, incident["id"], occurred_at="", content="미입력")
    make_evidence(client, incident["id"], occurred_at="2026-11-04T09:00", content="A")
    rows = client.get(f"/api/incidents/{incident['id']}/evidence").json()
    assert [r["content"] for r in rows] == ["A", "C", "미입력"]
    assert len(client.get("/api/evidence", params={"incident_id": incident["id"]}).json()) == 3


# ------------------------------------------------------------ 관계(삭제 동작)
def test_delete_incident_keeps_evidence_as_unassigned(client, incident):
    ev = make_evidence(client, incident["id"]).json()
    r = client.delete(f"/api/incidents/{incident['id']}")
    assert r.json()["evidence_deleted"] == 0
    kept = client.get(f"/api/evidence/{ev['id']}").json()
    assert kept["incident_id"] is None  # 외래 키 SET NULL → 미분류


def test_delete_incident_with_evidence(client, incident):
    ev = make_evidence(client, incident["id"]).json()
    other_ev = make_evidence(client).json()  # 미분류 자료는 영향 없음
    r = client.delete(f"/api/incidents/{incident['id']}", params={"delete_evidence": True})
    assert r.json()["evidence_deleted"] == 1
    assert client.get(f"/api/evidence/{ev['id']}").status_code == 404
    assert client.get(f"/api/evidence/{other_ev['id']}").status_code == 200


def test_state_endpoint(client, incident):
    make_evidence(client, incident["id"])
    s = client.get("/api/state").json()
    assert len(s["incidents"]) == 1 and len(s["evidence"]) == 1 and s["analysis_jobs"] == []
    assert s["incidents"][0]["evidence_count"] == 1


# ------------------------------------------------------------ 백업 · 마이그레이션
LEGACY = {
    "incidents": [
        {"id": "lq2x9a1b2c3d", "title": "기존 사건", "memo": "m", "createdAt": "2026-11-01T01:00:00.000Z", "updatedAt": "2026-11-01T02:00:00.000Z"}
    ],
    "evidence": [
        {"id": "lq2xaaaa1111", "incidentId": "lq2x9a1b2c3d", "channel": "messenger", "sender": "박팀장", "occurredAt": "2026-11-01T10:00",
         "content": "예전 메신저 자료", "createdAt": "2026-11-01T01:10:00.000Z", "updatedAt": "2026-11-01T01:10:00.000Z"},
        {"id": "lq2xbbbb2222", "incidentId": None, "channel": "sms", "sender": "", "occurredAt": "", "content": "미분류 문자",
         "createdAt": "2026-11-01T01:20:00.000Z", "updatedAt": "2026-11-01T01:20:00.000Z"},
        {"id": "lq2xcccc3333", "incidentId": "ghost-incident", "channel": "call", "sender": "", "occurredAt": "", "content": "사건이 사라진 자료",
         "createdAt": "2026-11-01T01:30:00.000Z", "updatedAt": "2026-11-01T01:30:00.000Z"},
        {"id": "lq2xdddd4444", "incidentId": None, "channel": "fax", "content": "잘못된 유형"},
        {"id": "lq2xeeee5555", "incidentId": None, "channel": "sms", "content": ""},
    ],
    "analyses": [],  # 무시되어야 함
}


def test_import_legacy_localstorage_preserves_ids_and_data(client):
    r = client.post("/api/import", json=LEGACY)
    assert r.status_code == 200
    res = r.json()
    assert res["incidents_added"] == 1 and res["evidence_added"] == 3
    assert res["evidence_unlinked"] == 1 and len(res["errors"]) == 2

    assert client.get("/api/incidents/lq2x9a1b2c3d").json()["created_at"] == "2026-11-01T01:00:00.000Z"
    ev = client.get("/api/evidence/lq2xaaaa1111").json()
    assert ev["channel"] == "email"  # messenger → email
    assert ev["incident_id"] == "lq2x9a1b2c3d" and ev["content"] == "예전 메신저 자료"
    assert client.get("/api/evidence/lq2xcccc3333").json()["incident_id"] is None  # 사건 없는 자료도 보존


def test_import_is_idempotent(client):
    client.post("/api/import", json=LEGACY)
    res = client.post("/api/import", json=LEGACY).json()
    assert res["incidents_added"] == 0 and res["incidents_skipped"] == 1
    assert res["evidence_added"] == 0 and res["evidence_skipped"] == 3
    assert len(client.get("/api/evidence").json()) == 3


def test_import_does_not_overwrite_existing(client):
    client.post("/api/incidents", json={"id": "lq2x9a1b2c3d", "title": "서버에 있던 제목"})
    client.post("/api/import", json=LEGACY)
    assert client.get("/api/incidents/lq2x9a1b2c3d").json()["title"] == "서버에 있던 제목"


def test_import_v1_items_without_ids(client):
    r = client.post("/api/import", json={"evidence": [{"channel": "sms", "sender": "", "occurredAt": "", "content": "v1 자료"}]})
    assert r.json()["evidence_added"] == 1
    assert client.get("/api/evidence").json()[0]["content"] == "v1 자료"


def test_export_then_restore_roundtrip(client, incident):
    make_evidence(client, incident["id"], content="백업 대상", channel="email")
    backup = client.get("/api/export").json()
    assert backup["version"] == 1 and len(backup["evidence"]) == 1

    assert client.delete("/api/data").status_code == 400  # confirm 없이는 삭제 불가
    assert client.delete("/api/data", params={"confirm": True}).status_code == 200
    assert client.get("/api/state").json()["incidents"] == []

    res = client.post("/api/import", json=backup).json()  # snake_case 백업 파일도 복원 가능
    assert res["incidents_added"] == 1 and res["evidence_added"] == 1 and res["errors"] == []
    restored = client.get("/api/state").json()
    assert restored["evidence"][0]["content"] == "백업 대상" and restored["evidence"][0]["incident_id"] == incident["id"]


def test_import_limit(client):
    r = client.post("/api/import", json={"evidence": [{"channel": "sms", "content": "x"}] * 5001})
    assert r.status_code == 413 and r.json()["error"]["code"] == "TOO_MANY_ITEMS"
