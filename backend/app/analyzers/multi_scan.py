"""MULTI SCAN — 복합 자료(문자·전화·이메일) 분석.

각 자료에서 사칭 대상 · 주요 주제 · URL · 긴급성 표현 · 요청 행동을 근거 문장과 함께 추출합니다.
AI 모델(multilingual-e5-small + 학습된 분류기)과 규칙의 결과는 항목마다 source 로 구분됩니다.
결과는 STEP 5 SCAM FLOW 가 그대로 읽을 수 있도록 data(scamcut.multiscan.v1)에 구조화해 저장합니다.
"""
from ..ml.pipeline import CAVEAT, LEVEL_LABEL
from .base import AnalysisContext, AnalyzerOutput, BaseAnalyzer
from .nlp import get_nlp, nlp_readiness

_CH = {"sms": "문자", "call": "전화", "email": "이메일"}


class MultiScanAnalyzer(BaseAnalyzer):
    key = "multi_scan"
    title = "MULTI SCAN"
    description = "문자·전화·이메일 자료에서 사칭 대상·주제·URL·긴급성·요청 행동을 추출"
    engine = "ai"
    implemented = True

    def readiness(self):
        return nlp_readiness()

    def run(self, ctx: AnalysisContext) -> AnalyzerOutput:
        res = get_nlp(ctx)
        evs = res["evidence"]
        c = res["overall"]["counts"]
        summary = f"자료 {len(evs)}건 분석 — 위험 징후 높음 {c['high']}건 · 주의 {c['caution']}건 · 낮음 {c['low']}건"

        lines = []
        for n, e in enumerate(evs, 1):
            bits = [a["name"] for a in e["actions"]]
            bits += [f"{i['category_name']} 사칭 표현" for i in e["impersonation"][:1]]
            lines.append(f"{n}. {_CH.get(e['channel'], e['channel'])} · {e['risk']['label']}({e['risk']['score']}점) · {e['classification']['label']}" + (f" — {', '.join(dict.fromkeys(bits))}" if bits else ""))
        lines.append(CAVEAT)

        level = res["overall"]["level"]
        return AnalyzerOutput(
            summary=summary,
            detail="\n".join(lines),
            verdict={"high": "danger", "caution": "caution", "low": "safe"}[level],
            data={
                "schema": "scamcut.multiscan.v1",
                "model": res["model"],
                "overall": res["overall"],
                "caveat": CAVEAT,
                "level_labels": LEVEL_LABEL,
                "evidence": evs,  # 증거별: 문장·엔티티·사칭·주제·긴급성·행동·분류·위험 수준 (모두 source 포함)
            },
        )
