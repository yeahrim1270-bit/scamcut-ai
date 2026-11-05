"""상태 일괄 조회, 백업 내보내기, localStorage 마이그레이션/복원 가져오기, 전체 삭제."""
from fastapi import APIRouter, Depends
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import IMPORT_MAX_ITEMS
from ..db import get_db
from ..errors import ApiError
from ..models import AnalysisJob, Evidence, Incident, new_id, now_iso
from ..schemas import (
    EvidenceOut,
    ExportOut,
    ImportEvidence,
    ImportIncident,
    ImportRequest,
    ImportResult,
    StateOut,
    AnalysisJobOut,
)
from .incidents import list_incidents_out

router = APIRouter(prefix="/api", tags=["data"])


def _state(db: Session) -> dict:
    ev = db.scalars(select(Evidence).order_by(Evidence.created_at.desc(), Evidence.id.desc())).all()
    jobs = db.scalars(select(AnalysisJob).order_by(AnalysisJob.created_at.desc())).all()
    return {
        "incidents": list_incidents_out(db),
        "evidence": [EvidenceOut.model_validate(e) for e in ev],
        "analysis_jobs": [AnalysisJobOut.model_validate(j) for j in jobs],
    }


@router.get("/state", response_model=StateOut)
def get_state(db: Session = Depends(get_db)):
    """앱 시작 시 한 번에 불러오는 전체 상태."""
    return _state(db)


@router.get("/export", response_model=ExportOut)
def export_data(db: Session = Depends(get_db)):
    """백업 파일용 전체 내보내기."""
    return {**_state(db), "version": 1, "exported_at": now_iso()}


def _err_text(prefix: str, i: int, e: ValidationError) -> str:
    first = e.errors()[0]
    loc = ".".join(str(x) for x in first["loc"])
    return f"{prefix}[{i}] {loc}: {first['msg']}"


@router.post("/import", response_model=ImportResult)
def import_data(payload: ImportRequest, db: Session = Depends(get_db)):
    """localStorage 자료 마이그레이션 / 백업 복원. 이미 있는 ID는 건너뛰므로 여러 번 실행해도 중복되지 않습니다."""
    if len(payload.incidents) > IMPORT_MAX_ITEMS or len(payload.evidence) > IMPORT_MAX_ITEMS:
        raise ApiError(413, "TOO_MANY_ITEMS", f"한 번에 가져올 수 있는 항목은 각각 최대 {IMPORT_MAX_ITEMS}개입니다.")

    errors: list[str] = []
    inc_ids = set(db.scalars(select(Incident.id)).all())
    ev_ids = set(db.scalars(select(Evidence.id)).all())
    inc_added = inc_skipped = ev_added = ev_skipped = unlinked = 0
    now = now_iso()

    for i, raw in enumerate(payload.incidents):
        try:
            m = ImportIncident.model_validate(raw)
        except ValidationError as e:
            errors.append(_err_text("incidents", i, e))
            continue
        if m.id in inc_ids:
            inc_skipped += 1
            continue
        db.add(Incident(id=m.id, title=m.title, memo=m.memo, created_at=m.created_at or now, updated_at=m.updated_at or m.created_at or now))
        inc_ids.add(m.id)
        inc_added += 1
    db.flush()

    for i, raw in enumerate(payload.evidence):
        try:
            m = ImportEvidence.model_validate(raw)
        except ValidationError as e:
            errors.append(_err_text("evidence", i, e))
            continue
        eid = m.id or new_id()
        if eid in ev_ids:
            ev_skipped += 1
            continue
        incident_id = m.incident_id
        if incident_id is not None and incident_id not in inc_ids:
            incident_id = None  # 사건을 찾을 수 없으면 자료를 버리지 않고 '미분류'로 보존
            unlinked += 1
        db.add(
            Evidence(
                id=eid,
                incident_id=incident_id,
                channel=m.channel,
                sender=m.sender,
                occurred_at=m.occurred_at,
                content=m.content,
                created_at=m.created_at or now,
                updated_at=m.updated_at or m.created_at or now,
            )
        )
        ev_ids.add(eid)
        ev_added += 1

    db.commit()
    return ImportResult(
        incidents_added=inc_added,
        incidents_skipped=inc_skipped,
        evidence_added=ev_added,
        evidence_skipped=ev_skipped,
        evidence_unlinked=unlinked,
        errors=errors[:50],
    )


@router.delete("/data")
def clear_data(confirm: bool = False, db: Session = Depends(get_db)):
    """모든 사건·자료·분석 기록 삭제. confirm=true 가 있어야 실행됩니다."""
    if not confirm:
        raise ApiError(400, "CONFIRM_REQUIRED", "전체 삭제는 confirm=true 가 필요합니다.")
    jobs = db.execute(delete(AnalysisJob)).rowcount or 0
    ev = db.execute(delete(Evidence)).rowcount or 0
    inc = db.execute(delete(Incident)).rowcount or 0
    db.commit()
    return {"incidents": inc, "evidence": ev, "analysis_jobs": jobs}
