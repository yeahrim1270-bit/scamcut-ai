"""분석 요청 구조(대기·진행·성공·실패) 테스트.

실제 분석 엔진은 아직 없으므로, '성공' 경로는 테스트 전용 더미 분석기를 레지스트리에 임시로 넣어 검증합니다.
(앱 코드에는 가짜 결과를 만드는 경로가 없습니다.)
"""
import pytest
from conftest import make_evidence

from app.analyzers import REGISTRY, AnalyzerOutput, BaseAnalyzer
from app.db import SessionLocal
from app.models import AnalysisJob, now_iso
from app.services.analysis_runner import fail_stale_jobs


class _Ok(BaseAnalyzer):
    implemented = True

    def __init__(self, key, verdict=None):
        self.key, self.title, self.verdict = key, key, verdict

    def run(self, ctx):
        return AnalyzerOutput(summary=f"{self.key}:{len(ctx.evidence)}건", detail=f"{self.key} 상세", verdict=self.verdict)


class _Boom(BaseAnalyzer):
    implemented = True
    key = "multi_scan"

    def run(self, ctx):
        raise RuntimeError("내부 오류 — 이 문구는 사용자에게 노출되면 안 됨")


def _ready(client, incident):
    make_evidence(client, incident["id"], occurred_at="2026-11-04T10:00", content="B")
    make_evidence(client, incident["id"], occurred_at="2026-11-04T09:00", content="A")


def test_capabilities_reflect_implementation(client):
    caps = {c["key"]: c for c in client.get("/api/analysis/capabilities").json()}
    assert list(caps) == ["multi_scan", "scam_flow", "action_guard", "safe_verify"]
    assert caps["multi_scan"]["implemented"] and caps["action_guard"]["implemented"]  # STEP 4
    assert not caps["scam_flow"]["implemented"] and not caps["safe_verify"]["implemented"]  # STEP 5 예정
    assert caps["scam_flow"]["ready"] is False and caps["scam_flow"]["note"]


def test_unimplemented_analyzers_fail_honestly_without_fake_result(client, incident):
    _ready(client, incident)
    r = client.post(f"/api/incidents/{incident['id']}/analyses", json={"analyzers": ["scam_flow", "safe_verify"]})
    assert r.status_code == 202
    first = r.json()
    assert first["status"] == "pending" and [s["status"] for s in first["steps"]] == ["pending"] * 2

    job = client.get(f"/api/analyses/{first['id']}").json()  # 백그라운드 실행 완료 후
    assert job["status"] == "failed" and job["error_code"] == "ANALYZER_NOT_IMPLEMENTED"
    assert job["result"] is None  # 가짜 결과 없음
    assert all(s["status"] == "failed" and s["error_code"] == "ANALYZER_NOT_IMPLEMENTED" and s["data"] is None for s in job["steps"])
    assert job["started_at"] and job["finished_at"]
    assert client.get(f"/api/incidents/{incident['id']}/analyses").json()[0]["id"] == first["id"]


def test_analysis_success_with_registered_analyzers(client, incident, monkeypatch):
    for k, v in (("multi_scan", None), ("scam_flow", "danger"), ("action_guard", "safe"), ("safe_verify", None)):
        monkeypatch.setitem(REGISTRY, k, _Ok(k, v))
    _ready(client, incident)
    job = client.post(f"/api/incidents/{incident['id']}/analyses").json()
    job = client.get(f"/api/analyses/{job['id']}").json()
    assert job["status"] == "succeeded" and job["error_code"] is None
    assert job["result"]["verdict"] == "danger"  # danger > safe
    assert job["result"]["sections"]["multi_scan"] == "multi_scan 상세"
    assert job["result"]["summary"].startswith("multi_scan:2건")  # 자료 2건이 시간순으로 전달됨
    assert all(s["status"] == "succeeded" for s in job["steps"])


def test_partial_failure_keeps_step_results_but_job_fails(client, incident, monkeypatch):
    monkeypatch.setitem(REGISTRY, "scam_flow", _Ok("scam_flow"))
    _ready(client, incident)
    job = client.post(f"/api/incidents/{incident['id']}/analyses", json={"analyzers": ["safe_verify", "scam_flow"]}).json()
    job = client.get(f"/api/analyses/{job['id']}").json()
    by = {s["key"]: s for s in job["steps"]}
    assert job["status"] == "failed" and by["safe_verify"]["status"] == "failed" and by["scam_flow"]["status"] == "succeeded"
    assert job["result"] is None


def test_analyzer_exception_hides_internal_message(client, incident, monkeypatch):
    monkeypatch.setitem(REGISTRY, "multi_scan", _Boom())
    _ready(client, incident)
    job = client.post(f"/api/incidents/{incident['id']}/analyses", json={"analyzers": ["multi_scan"]}).json()
    job = client.get(f"/api/analyses/{job['id']}").json()
    assert job["status"] == "failed" and job["error_code"] == "ANALYZER_ERROR"
    assert "내부 오류" not in (job["error_message"] or "")


def test_request_validation(client, incident):
    assert client.post("/api/incidents/nope12345/analyses").status_code == 404
    r = client.post(f"/api/incidents/{incident['id']}/analyses")  # 자료 없음
    assert r.status_code == 422 and r.json()["error"]["code"] == "NO_EVIDENCE"
    _ready(client, incident)
    assert client.post(f"/api/incidents/{incident['id']}/analyses", json={"analyzers": ["nope"]}).status_code == 422
    assert client.get("/api/analyses/nope12345").status_code == 404


def test_only_one_active_job_per_incident(client, incident):
    _ready(client, incident)
    with SessionLocal() as db:
        db.add(AnalysisJob(id="activejob001", incident_id=incident["id"], status="running", analyzers=["multi_scan"],
                           steps=[{"key": "multi_scan", "status": "running"}], created_at=now_iso()))
        db.commit()
    r = client.post(f"/api/incidents/{incident['id']}/analyses")
    assert r.status_code == 409 and r.json()["error"]["code"] == "ANALYSIS_IN_PROGRESS"


def test_stale_jobs_failed_on_restart(client, incident):
    with SessionLocal() as db:
        db.add(AnalysisJob(id="stalejob0001", incident_id=incident["id"], status="running", analyzers=["multi_scan"],
                           steps=[{"key": "multi_scan", "status": "running"}], created_at=now_iso()))
        db.commit()
    assert fail_stale_jobs() == 1
    job = client.get("/api/analyses/stalejob0001").json()
    assert job["status"] == "failed" and job["error_code"] == "SERVER_RESTARTED"


def test_deleting_incident_removes_its_jobs(client, incident):
    _ready(client, incident)
    jid = client.post(f"/api/incidents/{incident['id']}/analyses", json={"analyzers": ["scam_flow"]}).json()["id"]
    client.delete(f"/api/incidents/{incident['id']}")
    assert client.get(f"/api/analyses/{jid}").status_code == 404  # CASCADE
