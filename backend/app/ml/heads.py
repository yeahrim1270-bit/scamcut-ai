"""임베딩 위에 얹은 다중 라벨 분류기(로지스틱 회귀). 가중치는 weights/intent_heads.npz 에 저장됩니다."""
import json
import threading
from pathlib import Path
from typing import Optional

import numpy as np

WEIGHTS_DIR = Path(__file__).resolve().parent / "weights"
WEIGHTS_FILE = WEIGHTS_DIR / "intent_heads.npz"
META_FILE = WEIGHTS_DIR / "meta.json"


def sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


def fit_logreg(X: np.ndarray, y: np.ndarray, l2: float = 1.0, steps: int = 800, lr: float = 0.05) -> tuple[np.ndarray, float]:
    """이진 로지스틱 회귀 (Adam). 양성이 적은 라벨은 가중치를 높여 보정합니다."""
    n, d = X.shape
    pos = max(1.0, float(y.sum()))
    neg = max(1.0, float(n - y.sum()))
    w_pos = min(5.0, neg / pos)
    sw = np.where(y > 0.5, w_pos, 1.0)
    w = np.zeros(d)
    b = 0.0
    m_w, v_w, m_b, v_b = np.zeros(d), np.zeros(d), 0.0, 0.0
    b1, b2, eps = 0.9, 0.999, 1e-8
    for t in range(1, steps + 1):
        p = sigmoid(X @ w + b)
        g = (p - y) * sw
        gw = X.T @ g / n + l2 * w / n
        gb = g.mean()
        m_w = b1 * m_w + (1 - b1) * gw
        v_w = b2 * v_w + (1 - b2) * gw**2
        m_b = b1 * m_b + (1 - b1) * gb
        v_b = b2 * v_b + (1 - b2) * gb**2
        w -= lr * (m_w / (1 - b1**t)) / (np.sqrt(v_w / (1 - b2**t)) + eps)
        b -= lr * (m_b / (1 - b1**t)) / (np.sqrt(v_b / (1 - b2**t)) + eps)
    return w, float(b)


class IntentHeads:
    def __init__(self, W: np.ndarray, b: np.ndarray, mu: np.ndarray, sd: np.ndarray, thresholds: np.ndarray, labels: list[str], meta: dict):
        self.W, self.b, self.mu, self.sd, self.thresholds, self.labels, self.meta = W, b, mu, sd, thresholds, labels, meta

    def predict(self, emb: np.ndarray) -> np.ndarray:
        """(N, D) 임베딩 → (N, L) 확률"""
        if len(emb) == 0:
            return np.zeros((0, len(self.labels)))
        return sigmoid(((emb - self.mu) / self.sd) @ self.W.T + self.b)

    def threshold(self, label: str) -> float:
        return float(self.thresholds[self.labels.index(label)])


_heads: Optional[IntentHeads] = None
_lock = threading.Lock()


def weights_present() -> bool:
    return WEIGHTS_FILE.exists() and META_FILE.exists()


def load_heads() -> IntentHeads:
    global _heads
    if _heads is None:
        with _lock:
            if _heads is None:
                from .encoder import ModelUnavailable

                if not weights_present():
                    raise ModelUnavailable("분류기 가중치 파일이 없습니다. 'npm run train:model' 로 학습해 주세요.")
                z = np.load(WEIGHTS_FILE)
                meta = json.loads(META_FILE.read_text(encoding="utf-8"))
                _heads = IntentHeads(z["W"], z["b"], z["mu"], z["sd"], z["thresholds"], list(meta["labels"]), meta)
    return _heads
