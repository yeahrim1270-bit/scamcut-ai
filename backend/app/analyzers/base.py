"""분석기 공통 인터페이스.

STEP 4~5 에서 핵심 AI 기능 4개(MULTI SCAN / SCAM FLOW / ACTION GUARD / SAFE VERIFY)를
이 인터페이스의 `run()` 만 구현해 연결합니다. 지금은 모두 '미구현'이며 가짜 결과를 만들지 않습니다.
"""
from dataclasses import dataclass, field
from typing import Any, Literal, Optional


class AnalyzerNotImplemented(Exception):
    """아직 구현되지 않은 분석기."""


class AnalyzerUnavailable(Exception):
    """구현은 되어 있지만 지금은 실행할 수 없음 (예: AI 모델 파일이 없음)."""


@dataclass
class EvidenceView:
    id: str
    channel: str
    sender: str
    occurred_at: str
    content: str


@dataclass
class AnalysisContext:
    incident_id: str
    incident_title: str
    evidence: list[EvidenceView] = field(default_factory=list)  # 시간순 정렬됨
    shared: dict = field(default_factory=dict)  # 같은 요청 안에서 분석기끼리 공유하는 중간 결과(예: NLP 분석 1회만 실행)


@dataclass
class AnalyzerOutput:
    summary: str  # 한 줄 요약
    detail: Optional[str] = None  # 해당 영역에 표시할 상세 내용
    verdict: Optional[Literal["danger", "caution", "safe"]] = None  # 판정(있을 때만 스캔이 문구가 바뀜)
    data: Optional[dict[str, Any]] = None  # 다음 단계(SCAM FLOW 등)가 그대로 읽을 수 있는 구조화 결과


class BaseAnalyzer:
    key: str = ""
    title: str = ""
    description: str = ""
    engine: Literal["ai", "rule"] = "rule"
    implemented: bool = False
    not_implemented_message: str = "이 분석 기능은 아직 구현되지 않았습니다."

    def readiness(self) -> tuple[bool, Optional[str]]:
        """(실행 가능 여부, 불가할 때 안내 문구)"""
        return self.implemented, None if self.implemented else "다음 단계에서 연결됩니다."

    def run(self, ctx: AnalysisContext) -> AnalyzerOutput:
        raise AnalyzerNotImplemented(self.not_implemented_message)
