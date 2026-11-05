"""요청/응답 스키마와 입력 검증."""
import re
from datetime import datetime
from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from pydantic.alias_generators import to_camel

Channel = Literal["sms", "call", "email"]
JobStatus = Literal["pending", "running", "succeeded", "failed"]
StepStatus = Literal["pending", "running", "succeeded", "failed"]
AnalyzerKey = Literal["multi_scan", "scam_flow", "action_guard", "safe_verify"]
Verdict = Literal["danger", "caution", "safe"]

# 클라이언트가 만든 ID를 그대로 쓸 수 있게 허용 (localStorage 마이그레이션 시 ID 보존)
IdStr = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{6,64}$")]

_OCCURRED_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$")


def validate_occurred_at(v: str) -> str:
    v = (v or "").strip()
    if v == "":
        return ""  # 시각 미입력 허용
    if not _OCCURRED_RE.match(v):
        raise ValueError("발생 일시 형식이 올바르지 않습니다.")
    try:
        datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError as e:
        raise ValueError("존재하지 않는 날짜/시각입니다.") from e
    return v


# ---------------------------------------------------------------- 사건
class IncidentCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: Optional[IdStr] = None
    title: str = Field(min_length=1, max_length=100)
    memo: str = Field(default="", max_length=1000)


class IncidentUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    memo: Optional[str] = Field(default=None, max_length=1000)


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    memo: str
    created_at: str
    updated_at: str
    evidence_count: int = 0


# ---------------------------------------------------------------- 자료
class EvidenceCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: Optional[IdStr] = None
    incident_id: Optional[IdStr] = None  # None = 미분류
    channel: Channel
    sender: str = Field(default="", max_length=120)
    occurred_at: str = ""
    content: str = Field(min_length=1, max_length=3000)

    @field_validator("occurred_at")
    @classmethod
    def _occurred(cls, v: str) -> str:
        return validate_occurred_at(v)


class EvidenceUpdate(BaseModel):
    """부분 수정. incident_id 를 null 로 보내면 '미분류'로 되돌립니다(필드 생략과 구분)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    incident_id: Optional[IdStr] = None
    channel: Optional[Channel] = None
    sender: Optional[str] = Field(default=None, max_length=120)
    occurred_at: Optional[str] = None
    content: Optional[str] = Field(default=None, min_length=1, max_length=3000)

    @field_validator("occurred_at")
    @classmethod
    def _occurred(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else validate_occurred_at(v)


class EvidenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    incident_id: Optional[str]
    channel: str
    sender: str
    occurred_at: str
    content: str
    created_at: str
    updated_at: str


# ---------------------------------------------------------------- 분석
class AnalyzerInfo(BaseModel):
    key: AnalyzerKey
    title: str
    description: str
    engine: Literal["ai", "rule"]
    implemented: bool
    ready: bool = False  # 지금 바로 실행 가능한지 (모델 파일 등 준비 상태)
    note: Optional[str] = None


class AnalysisRequest(BaseModel):
    analyzers: Optional[list[AnalyzerKey]] = None  # 생략하면 4개 모두


class AnalysisStep(BaseModel):
    model_config = ConfigDict(extra="ignore")

    key: AnalyzerKey
    status: StepStatus
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    summary: Optional[str] = None
    detail: Optional[str] = None
    verdict: Optional[Verdict] = None
    data: Optional[dict[str, Any]] = None  # 분석기가 만든 구조화 결과 (근거 문장·출처 포함)
    started_at: Optional[str] = None
    finished_at: Optional[str] = None


class AnalysisResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    summary: str
    kind: Literal["ai", "rule"] = "rule"
    verdict: Optional[Verdict] = None
    sections: dict[str, Optional[str]] = {}


class AnalysisJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    incident_id: str
    status: JobStatus
    analyzers: list[str]
    steps: list[AnalysisStep]
    result: Optional[AnalysisResult] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None


# ---------------------------------------------------------------- 상태/백업
class StateOut(BaseModel):
    incidents: list[IncidentOut]
    evidence: list[EvidenceOut]
    analysis_jobs: list[AnalysisJobOut]


class ExportOut(StateOut):
    version: int = 1
    exported_at: str


class ImportRequest(BaseModel):
    """localStorage(camelCase) 와 서버 내보내기 파일(snake_case) 둘 다 받습니다.
    항목 단위로 검증하므로 일부가 잘못돼도 나머지는 가져옵니다."""

    incidents: list[dict[str, Any]] = []
    evidence: list[dict[str, Any]] = []


class _ImportBase(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore", str_strip_whitespace=True)


class ImportIncident(_ImportBase):
    id: IdStr
    title: str = Field(min_length=1, max_length=100)
    memo: str = Field(default="", max_length=1000)
    created_at: Optional[str] = Field(default=None, max_length=40)
    updated_at: Optional[str] = Field(default=None, max_length=40)


class ImportEvidence(_ImportBase):
    id: Optional[IdStr] = None
    incident_id: Optional[str] = None
    channel: str
    sender: str = Field(default="", max_length=120)
    occurred_at: str = ""
    content: str = Field(min_length=1, max_length=3000)
    created_at: Optional[str] = Field(default=None, max_length=40)
    updated_at: Optional[str] = Field(default=None, max_length=40)

    @field_validator("channel")
    @classmethod
    def _channel(cls, v: str) -> str:
        v = "email" if v == "messenger" else v  # 이전 버전의 '메신저' 유형은 이메일로 이어서 사용
        if v not in ("sms", "call", "email"):
            raise ValueError("지원하지 않는 자료 유형입니다.")
        return v

    @field_validator("occurred_at")
    @classmethod
    def _occurred(cls, v: str) -> str:
        return validate_occurred_at(v)


class ImportResult(BaseModel):
    incidents_added: int
    incidents_skipped: int
    evidence_added: int
    evidence_skipped: int
    evidence_unlinked: int  # 연결된 사건을 찾지 못해 '미분류'로 가져온 자료 수
    errors: list[str]
