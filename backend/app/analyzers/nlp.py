"""MULTI SCAN · ACTION GUARD 가 함께 쓰는 NLP 분석 (한 요청에서 한 번만 실행)."""
from typing import Optional

from ..ml.encoder import ModelUnavailable, OnnxEncoder
from ..ml.heads import weights_present
from ..ml.pipeline import analyze_evidence
from .base import AnalysisContext, AnalyzerUnavailable


def nlp_readiness() -> tuple[bool, Optional[str]]:
    if not OnnxEncoder.files_present():
        return False, "AI 모델 파일이 없습니다. 'npm run setup:model' 을 실행해 주세요."
    if not weights_present():
        return False, "분류기 가중치가 없습니다. 'npm run train:model' 을 실행해 주세요."
    return True, None


def get_nlp(ctx: AnalysisContext) -> dict:
    if "nlp" not in ctx.shared:
        ready, note = nlp_readiness()
        if not ready:
            raise AnalyzerUnavailable(note or "AI 모델을 사용할 수 없습니다.")
        try:
            ctx.shared["nlp"] = analyze_evidence(ctx.evidence)
        except ModelUnavailable as e:
            raise AnalyzerUnavailable(str(e)) from e
    return ctx.shared["nlp"]
