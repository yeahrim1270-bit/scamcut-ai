from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..analyzers import ANALYZER_KEYS, REGISTRY
from ..db import get_db
from ..errors import ApiError, not_found
from ..models import AnalysisJob, Evidence, Incident, new_id, now_iso
from ..schemas import AnalysisJobOut, AnalysisRequest, AnalyzerInfo
from ..services.analysis_runner import run_job

router = APIRouter(prefix="/api", tags=["analysis"])


@router.get("/analysis/capabilities", response_model=list[AnalyzerInfo])
def capabilities():
    """분석기 4종의 구현 여부. 앱은 이 값으로 '준비 중' 표시를 결정합니다."""
    out = []
    for a in REGISTRY.values():
        ready, note = a.readiness()
        out.append(AnalyzerInfo(key=a.key, title=a.title, description=a.description, engine=a.engine, implemented=a.implemented, ready=ready, note=note))
    return out


@router.get("/incidents/{incident_id}/analyses", response_model=list[AnalysisJobOut])
def list_jobs(incident_id: str, db: Session = Depends(get_db)):
    if db.get(Incident, incident_id) is None:
        raise not_found("사건")
    return db.scalars(
        select(AnalysisJob).where(AnalysisJob.incident_id == incident_id).order_by(AnalysisJob.created_at.desc())
    ).all()


@router.post("/incidents/{incident_id}/analyses", response_model=AnalysisJobOut, status_code=202)
def request_analysis(
    incident_id: str,
    background: BackgroundTasks,
    data: AnalysisRequest | None = None,
    db: Session = Depends(get_db),
):
    """분석 요청을 접수하고 즉시 'pending' 작업을 돌려줍니다. 진행 상태는 GET /api/analyses/{id} 로 조회하세요."""
    if db.get(Incident, incident_id) is None:
        raise not_found("사건")
    evidence_count = db.scalar(select(func.count()).select_from(Evidence).where(Evidence.incident_id == incident_id)) or 0
    if evidence_count == 0:
        raise ApiError(422, "NO_EVIDENCE", "분석할 자료가 없습니다. 사건에 자료를 먼저 등록해 주세요.")
    active = db.scalar(
        select(func.count())
        .select_from(AnalysisJob)
        .where(AnalysisJob.incident_id == incident_id, AnalysisJob.status.in_(("pending", "running")))
    )
    if active:
        raise ApiError(409, "ANALYSIS_IN_PROGRESS", "이미 진행 중인 분석 요청이 있습니다.")

    # 요청에 분석기를 지정하지 않으면 '구현된' 분석기만 실행합니다. (하나도 없으면 전체를 요청해 미구현 상태를 그대로 보여 줌)
    default = [k for k, a in REGISTRY.items() if a.implemented] or list(ANALYZER_KEYS)
    keys = list(dict.fromkeys(data.analyzers)) if data and data.analyzers else default
    job = AnalysisJob(
        id=new_id(),
        incident_id=incident_id,
        status="pending",
        analyzers=keys,
        steps=[{"key": k, "status": "pending"} for k in keys],
        created_at=now_iso(),
    )
    db.add(job)
    db.commit()
    background.add_task(run_job, job.id)
    return job


@router.get("/analyses/{job_id}", response_model=AnalysisJobOut)
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.get(AnalysisJob, job_id)
    if job is None:
        raise not_found("분석 요청")
    return job
