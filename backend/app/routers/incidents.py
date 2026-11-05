from fastapi import APIRouter, Depends
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import ApiError, not_found
from ..models import Evidence, Incident, new_id, now_iso
from ..schemas import IncidentCreate, IncidentOut, IncidentUpdate

router = APIRouter(prefix="/api", tags=["incidents"])


def to_out(inc: Incident, count: int) -> IncidentOut:
    out = IncidentOut.model_validate(inc)
    out.evidence_count = count
    return out


def _count(db: Session, incident_id: str) -> int:
    return db.scalar(select(func.count()).select_from(Evidence).where(Evidence.incident_id == incident_id)) or 0


def list_incidents_out(db: Session) -> list[IncidentOut]:
    counts = dict(
        db.execute(
            select(Evidence.incident_id, func.count()).where(Evidence.incident_id.is_not(None)).group_by(Evidence.incident_id)
        ).all()
    )
    rows = db.scalars(select(Incident).order_by(Incident.created_at.desc(), Incident.id.desc())).all()
    return [to_out(r, counts.get(r.id, 0)) for r in rows]


@router.get("/incidents", response_model=list[IncidentOut])
def list_incidents(db: Session = Depends(get_db)):
    return list_incidents_out(db)


@router.post("/incidents", response_model=IncidentOut, status_code=201)
def create_incident(data: IncidentCreate, db: Session = Depends(get_db)):
    new = data.id or new_id()
    if db.get(Incident, new) is not None:
        raise ApiError(409, "CONFLICT", "이미 존재하는 사건 ID입니다.")
    t = now_iso()
    inc = Incident(id=new, title=data.title, memo=data.memo, created_at=t, updated_at=t)
    db.add(inc)
    db.commit()
    return to_out(inc, 0)


@router.get("/incidents/{incident_id}", response_model=IncidentOut)
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    inc = db.get(Incident, incident_id)
    if inc is None:
        raise not_found("사건")
    return to_out(inc, _count(db, incident_id))


@router.patch("/incidents/{incident_id}", response_model=IncidentOut)
def update_incident(incident_id: str, data: IncidentUpdate, db: Session = Depends(get_db)):
    inc = db.get(Incident, incident_id)
    if inc is None:
        raise not_found("사건")
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    for k, v in changes.items():
        setattr(inc, k, v)
    inc.updated_at = now_iso()
    db.commit()
    return to_out(inc, _count(db, incident_id))


@router.delete("/incidents/{incident_id}")
def delete_incident(incident_id: str, delete_evidence: bool = False, db: Session = Depends(get_db)):
    """사건 삭제. 기본은 자료를 '미분류'로 남기고, delete_evidence=true 면 자료도 함께 삭제합니다."""
    inc = db.get(Incident, incident_id)
    if inc is None:
        raise not_found("사건")
    removed = 0
    if delete_evidence:
        removed = db.execute(delete(Evidence).where(Evidence.incident_id == incident_id)).rowcount or 0
    db.delete(inc)  # 남은 자료는 DB 외래 키(ON DELETE SET NULL)로 미분류 처리, 분석 기록은 CASCADE 삭제
    db.commit()
    return {"deleted": incident_id, "evidence_deleted": removed}
