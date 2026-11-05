"""문장 임베딩 인코더 (multilingual-e5-small, ONNX Runtime/CPU).

- 모델 파일은 처음 사용할 때 한 번만 읽고 프로세스 안에서 재사용합니다. (스레드 안전)
- e5 모델 규약에 따라 입력 앞에 "query: " 를 붙이고, 평균 풀링 후 L2 정규화합니다.
"""
import threading
from typing import Optional

import numpy as np

from .model_spec import MAX_TOKENS, MODEL_DIR, MODEL_ID


class ModelUnavailable(Exception):
    """모델 파일이 없거나 불러올 수 없음."""


class OnnxEncoder:
    def __init__(self) -> None:
        self._session = None
        self._tokenizer = None
        self._input_names: set[str] = set()
        self._lock = threading.Lock()  # 로딩 중복 방지
        self._run_lock = threading.Lock()  # 동시 추론 시 메모리 폭증 방지

    # ------------------------------------------------------------------ 준비 상태
    @staticmethod
    def files_present() -> bool:
        return (MODEL_DIR / "model.onnx").exists() and (MODEL_DIR / "tokenizer.json").exists()

    @property
    def loaded(self) -> bool:
        return self._session is not None

    def load(self) -> None:
        if self._session is not None:
            return
        with self._lock:
            if self._session is not None:
                return
            if not self.files_present():
                raise ModelUnavailable(
                    "AI 모델 파일이 없습니다. PowerShell 에서 'npm run setup:model' 을 실행해 모델을 내려받아 주세요."
                )
            try:
                import onnxruntime as ort
                from tokenizers import Tokenizer

                opts = ort.SessionOptions()
                opts.intra_op_num_threads = max(1, min(8, (__import__("os").cpu_count() or 4) - 2))
                self._session = ort.InferenceSession(
                    str(MODEL_DIR / "model.onnx"), sess_options=opts, providers=["CPUExecutionProvider"]
                )
                tok = Tokenizer.from_file(str(MODEL_DIR / "tokenizer.json"))
                tok.enable_truncation(max_length=MAX_TOKENS)
                tok.enable_padding(pad_id=1, pad_token="<pad>")  # XLM-R 계열: <pad> = 1
                self._tokenizer = tok
                self._input_names = {i.name for i in self._session.get_inputs()}
            except ModelUnavailable:
                raise
            except Exception as e:
                self._session = None
                raise ModelUnavailable(f"AI 모델을 불러오지 못했습니다 ({type(e).__name__}).") from e

    # ------------------------------------------------------------------ 추론
    def encode(self, texts: list[str], prefix: str = "query: ", batch_size: int = 16) -> np.ndarray:
        """문장 목록 → (N, 384) L2 정규화 벡터."""
        if not texts:
            return np.zeros((0, 384), dtype=np.float32)
        self.load()
        assert self._session is not None and self._tokenizer is not None
        out: list[np.ndarray] = []
        for i in range(0, len(texts), batch_size):
            chunk = [prefix + t for t in texts[i : i + batch_size]]
            enc = self._tokenizer.encode_batch(chunk)
            ids = np.array([e.ids for e in enc], dtype=np.int64)
            mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
            feed = {"input_ids": ids, "attention_mask": mask}
            if "token_type_ids" in self._input_names:
                feed["token_type_ids"] = np.zeros_like(ids)
            with self._run_lock:
                hidden = self._session.run(None, feed)[0]  # (B, T, 384)
            m = mask[..., None].astype(np.float32)
            pooled = (hidden * m).sum(axis=1) / np.clip(m.sum(axis=1), 1e-9, None)
            pooled /= np.clip(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-9, None)
            out.append(pooled.astype(np.float32))
        return np.concatenate(out, axis=0)

    def info(self) -> dict:
        return {"model": MODEL_ID, "loaded": self.loaded, "files_present": self.files_present()}


_encoder: Optional[OnnxEncoder] = None
_encoder_lock = threading.Lock()


def get_encoder() -> OnnxEncoder:
    global _encoder
    if _encoder is None:
        with _encoder_lock:
            if _encoder is None:
                _encoder = OnnxEncoder()
    return _encoder
