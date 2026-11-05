from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import ApiError, not_found
from ..models import Evidence, Incident, new_id, now_iso
from ..schemas import EvidenceCreate, EvidenceOut, EvidenceUpdate

router = APIRouter(prefix="/api", tags=["evidence"])


def _require_incident(db: Session, incident_id: Optional[str]) -> None:
    if incident_id is not None and db.get(Incident, incident_id) is None:
        raise ApiError(
            422,
            "INCIDENT_NOT_FOUND",
            "연결하려는 사건이 존재하지 않습니다.",
            [{"field": "incident_id", "message": "존재하지 않는 사건입니다."}],
        )


@router.get("/evidence", response_model=list[EvidenceOut])
def list_evidence(incident_id: Optional[str] = None, unassigned: bool = False, db: Session = Depends(get_db)):
    q = select(Evidence).order_by(Evidence.created_at.desc(), Evidence.id.desc())
    if unassigned:
        q = q.where(Evidence.incident_id.is_(None))
    elif incident_id:
        q = q.where(Evidence.incident_id == incident_id)
    return db.scalars(q).all()


@router.get("/incidents/{incident_id}/evidence", response_model=list[EvidenceOut])
def list_incident_evidence(incident_id: str, db: Session = Depends(get_db)):
    if db.get(Incident, incident_id) is None:
        raise not_found("사건")
    rows = db.scalars(select(Evidence).where(Evidence.incident_id == incident_id)).all()
    # 시각이 있는 자료는 시간순, 미입력은 맨 뒤
    return sorted(rows, key=lambda e: (e.occurred_at == "", e.occurred_at, e.created_at))


@router.post("/evidence", response_model=EvidenceOut, status_code=201)
def create_evidence(data: EvidenceCreate, db: Session = Depends(get_db)):
    _require_incident(db, data.incident_id)
    new = data.id or new_id()
    if db.get(Evidence, new) is not None:
        raise ApiError(409, "CONFLICT", "이미 존재하는 자료 ID입니다.")
    t = now_iso()
    ev = Evidence(
        id=new,
        incident_id=data.incident_id,
        channel=data.channel,
        sender=data.sender,
        occurred_at=data.occurred_at,
        content=data.content,
        created_at=t,
        updated_at=t,
    )
    db.add(ev)
    if data.incident_id:
        inc = db.get(Incident, data.incident_id)
        if inc:
            inc.updated_at = t
    db.commit()
    return ev


@router.get("/evidence/{evidence_id}", response_model=EvidenceOut)
def get_evidence(evidence_id: str, db: Session = Depends(get_db)):
    ev = db.get(Evidence, evidence_id)
    if ev is None:
        raise not_found("자료")
    return ev


@router.patch("/evidence/{evidence_id}", response_model=EvidenceOut)
def update_evidence(evidence_id: str, data: EvidenceUpdate, db: Session = Depends(get_db)):
    ev = db.get(Evidence, evidence_id)
    if ev is None:
        raise not_found("자료")
    sent = data.model_fields_set
    if "incident_id" in sent:
        _require_incident(db, data.incident_id)
        ev.incident_id = data.incident_id  # null 이면 미분류
    for name in ("channel", "sender", "occurred_at", "content"):
        if name in sent and getattr(data, name) is not None:
            setattr(ev, name, getattr(data, name))
    t = now_iso()
    ev.updated_at = t
    if ev.incident_id:
        inc = db.get(Incident, ev.incident_id)
        if inc:
            inc.updated_at = t
    db.commit()
    return ev


@router.delete("/evidence/{evidence_id}")
def delete_evidence(evidence_id: str, db: Session = Depends(get_db)):
    ev = db.get(Evidence, evidence_id)
    if ev is None:
        raise not_found("자료")
    db.delete(ev)
    db.commit()
    return {"deleted": evidence_id}
