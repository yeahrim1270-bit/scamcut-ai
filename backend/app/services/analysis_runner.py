"""분석 요청 실행기: pending → running → succeeded | failed.

각 분석기는 순서대로 실행되고, 단계(step)마다 진행 상태가 DB에 저장되어 앱이 조회할 수 있습니다.
미구현 분석기는 결과를 만들어 내지 않고 'ANALYZER_NOT_IMPLEMENTED' 로 실패 처리합니다.
"""
import logging
from typing import Callable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..analyzers import REGISTRY, AnalysisContext, AnalyzerNotImplemented, AnalyzerUnavailable, EvidenceView
from ..db import SessionLocal
from ..models import AnalysisJob, Evidence, Incident, now_iso

log = logging.getLogger("scamcut.analysis")

NOT_IMPLEMENTED = "ANALYZER_NOT_IMPLEMENTED"
MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
ANALYZER_ERROR = "ANALYZER_ERROR"


def _evidence_sorted(rows: list[Evidence]) -> list[Evidence]:
    # 시각이 있는 자료는 시간순, 없는 자료는 맨 뒤(등록순)
    return sorted(rows, key=lambda e: (e.occurred_at == "", e.occurred_at, e.created_at))


def build_context(db: Session, incident: Incident) -> AnalysisContext:
    rows = db.scalars(select(Evidence).where(Evidence.incident_id == incident.id)).all()
    return AnalysisContext(
        incident_id=incident.id,
        incident_title=incident.title,
        evidence=[
            EvidenceView(e.id, e.channel, e.sender, e.occurred_at, e.content) for e in _evidence_sorted(list(rows))
        ],
    )


def _aggregate(steps: list[dict]) -> dict:
    verdicts = [s.get("verdict") for s in steps if s.get("verdict")]
    verdict = "danger" if "danger" in verdicts else "caution" if "caution" in verdicts else ("safe" if "safe" in verdicts else None)
    kind = "ai" if any(getattr(REGISTRY.get(s["key"]), "engine", "rule") == "ai" for s in steps) else "rule"
    return {
        "title": "사건 분석",
        "summary": "\n".join(s["summary"] for s in steps if s.get("summary")),
        "kind": kind,
        "verdict": verdict,
        "sections": {s["key"]: s.get("detail") for s in steps},
    }


def run_job(job_id: str, session_factory: Callable[[], Session] = SessionLocal) -> None:
    with session_factory() as db:
        job: Optional[AnalysisJob] = db.get(AnalysisJob, job_id)
        if job is None or job.status != "pending":
            return
        incident = db.get(Incident, job.incident_id)
        if incident is None:  # 요청 직후 사건이 삭제된 경우
            return

        job.status = "running"
        job.started_at = now_iso()
        db.commit()

        ctx = build_context(db, incident)
        steps: list[dict] = [dict(s) for s in job.steps]

        for step in steps:
            analyzer = REGISTRY.get(step["key"])
            step["status"] = "running"
            step["started_at"] = now_iso()
            job.steps = [dict(s) for s in steps]
            db.commit()
            try:
                if analyzer is None:
                    raise AnalyzerNotImplemented("등록되지 않은 분석기입니다.")
                out = analyzer.run(ctx)
                step.update(status="succeeded", summary=out.summary, detail=out.detail, verdict=out.verdict, data=out.data)
            except AnalyzerNotImplemented as e:
                step.update(status="failed", error_code=NOT_IMPLEMENTED, error_message=str(e))
            except AnalyzerUnavailable as e:
                step.update(status="failed", error_code=MODEL_UNAVAILABLE, error_message=str(e))
            except Exception as e:  # 분석기 내부 오류 — 자료 내용은 로그에 남기지 않음
                log.error("analyzer %s failed: %s", step["key"], type(e).__name__)
                step.update(status="failed", error_code=ANALYZER_ERROR, error_message="분석 중 오류가 발생했습니다.")
            step["finished_at"] = now_iso()
            job.steps = [dict(s) for s in steps]
            db.commit()

        failed = [s for s in steps if s["status"] == "failed"]
        job.finished_at = now_iso()
        if failed:
            job.status = "failed"
            job.error_code = failed[0]["error_code"]
            job.error_message = (
                failed[0]["error_message"]
                if len(failed) == 1
                else f"{len(failed)}개 분석기가 완료되지 않았습니다. {failed[0]['error_message']}"
            )
        else:
            job.status = "succeeded"
            job.result = _aggregate(steps)
        db.commit()


def fail_stale_jobs(session_factory: Callable[[], Session] = SessionLocal) -> int:
    """서버가 재시작되면 진행 중이던 작업은 이어지지 않으므로 실패로 정리합니다."""
    with session_factory() as db:
        rows = db.scalars(select(AnalysisJob).where(AnalysisJob.status.in_(("pending", "running")))).all()
        for job in rows:
            job.status = "failed"
            job.error_code = "SERVER_RESTARTED"
            job.error_message = "서버가 재시작되어 분석이 중단되었습니다. 다시 요청해 주세요."
            job.finished_at = now_iso()
            job.steps = [
                {**s, "status": "failed", "error_code": "SERVER_RESTARTED", "error_message": "분석이 중단되었습니다."}
                if s.get("status") in ("pending", "running")
                else s
                for s in job.steps
            ]
        db.commit()
        return len(rows)
