from .base import BaseAnalyzer


class SafeVerifyAnalyzer(BaseAnalyzer):
    key = "safe_verify"
    title = "SAFE VERIFY"
    description = "공식 경로 확인과 안전 행동 안내"
    engine = "rule"
    implemented = False
    not_implemented_message = "SAFE VERIFY 분석 엔진은 다음 단계(STEP 4~5)에서 연결됩니다."

    # STEP 4~5: run(self, ctx) -> AnalyzerOutput 을 구현하고 implemented = True 로 바꾸면
    # 분석 요청 → 상태 추적 → 결과 표시까지 기존 구조 그대로 연결됩니다.
