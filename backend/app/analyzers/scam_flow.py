from .base import BaseAnalyzer


class ScamFlowAnalyzer(BaseAnalyzer):
    key = "scam_flow"
    title = "SCAM FLOW"
    description = "여러 자료의 연관성을 분석해 하나의 사건 흐름으로 연결"
    engine = "ai"
    implemented = False
    not_implemented_message = "SCAM FLOW 분석 엔진은 다음 단계(STEP 4~5)에서 연결됩니다."

    # STEP 4~5: run(self, ctx) -> AnalyzerOutput 을 구현하고 implemented = True 로 바꾸면
    # 분석 요청 → 상태 추적 → 결과 표시까지 기존 구조 그대로 연결됩니다.
