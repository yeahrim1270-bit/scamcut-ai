"""분석기 레지스트리. 실행 순서 = 등록 순서."""
from .action_guard import ActionGuardAnalyzer
from .base import AnalysisContext, AnalyzerNotImplemented, AnalyzerOutput, AnalyzerUnavailable, BaseAnalyzer, EvidenceView
from .multi_scan import MultiScanAnalyzer
from .safe_verify import SafeVerifyAnalyzer
from .scam_flow import ScamFlowAnalyzer

REGISTRY: dict[str, BaseAnalyzer] = {}


def register(analyzer: BaseAnalyzer) -> None:
    REGISTRY[analyzer.key] = analyzer


for _a in (MultiScanAnalyzer(), ScamFlowAnalyzer(), ActionGuardAnalyzer(), SafeVerifyAnalyzer()):
    register(_a)

ANALYZER_KEYS = tuple(REGISTRY.keys())

__all__ = [
    "REGISTRY",
    "ANALYZER_KEYS",
    "register",
    "AnalysisContext",
    "AnalyzerNotImplemented",
    "AnalyzerUnavailable",
    "AnalyzerOutput",
    "BaseAnalyzer",
    "EvidenceView",
]
