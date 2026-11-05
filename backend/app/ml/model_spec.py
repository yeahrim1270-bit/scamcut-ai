"""사용하는 공개 AI 모델 정보와 경로.

모델: intfloat/multilingual-e5-small  (MIT 라이선스, 한국어 포함 100개 언어, 118M 파라미터)
 - 문장을 384차원 의미 벡터로 바꾸는 인코더입니다. (ONNX Runtime 으로 CPU 에서 실행, 외부 API·GPU 불필요)
 - 이 위에 한국어 사기 유형 분류기(app/ml/weights/intent_heads.npz)를 학습해 사용합니다.
"""
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
MODEL_ID = "intfloat/multilingual-e5-small"
MODEL_DIR = Path(os.getenv("SCAMCUT_MODEL_DIR") or (BACKEND_DIR / "models" / "multilingual-e5-small"))

# 로컬 파일명 -> HuggingFace 저장소 내 경로
FILES = {
    "model.onnx": "onnx/model.onnx",
    "tokenizer.json": "tokenizer.json",
}
MAX_TOKENS = 128
