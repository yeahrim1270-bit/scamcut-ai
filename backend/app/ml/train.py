"""분류기 학습: python -m app.ml.train

1) 학습 문장을 multilingual-e5-small 로 임베딩하고
2) 라벨별 로지스틱 회귀를 학습합니다.
3) 5-겹 교차검증의 out-of-fold 예측으로 라벨별 임계값과 성능(정밀도·재현율·F1)을 계산해
   weights/meta.json 에 기록합니다. (학습에 쓴 문장으로 점수를 매기지 않아 과대평가를 피함)
"""
import json
import sys
from datetime import datetime, timezone

import numpy as np

from .data import training_data_extra, training_data_extra2  # noqa: F401  (보강 데이터를 DATA 에 추가)
from .data.training_data import DATA
from .encoder import get_encoder
from .heads import META_FILE, WEIGHTS_DIR, WEIGHTS_FILE, fit_logreg, sigmoid
from .intents import LABELS
from .model_spec import MODEL_ID

L2 = 30.0
K = 5
SEED = 7


def prf(y: np.ndarray, pred: np.ndarray) -> tuple[float, float, float]:
    tp = float(((pred == 1) & (y == 1)).sum())
    fp = float(((pred == 1) & (y == 0)).sum())
    fn = float(((pred == 0) & (y == 1)).sum())
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return p, r, f


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    texts = [t for t, _ in DATA]
    assert len(set(texts)) == len(texts), "학습 데이터에 중복 문장이 있습니다."
    Y = np.array([[1.0 if l in labels else 0.0 for l in LABELS] for _, labels in DATA])
    unknown = {l for _, labels in DATA for l in labels} - set(LABELS)
    assert not unknown, f"정의되지 않은 라벨: {unknown}"
    print(f"학습 문장 {len(texts)}개, 라벨 {len(LABELS)}개 | 모델 {MODEL_ID}")

    X = get_encoder().encode(texts)
    mu, sd = X.mean(axis=0), X.std(axis=0) + 1e-6
    Z = (X - mu) / sd

    # ---- 교차검증 (out-of-fold)
    rng = np.random.default_rng(SEED)
    fold = rng.permutation(len(texts)) % K
    oof = np.zeros_like(Y)
    for k in range(K):
        tr, te = fold != k, fold == k
        for j in range(len(LABELS)):
            w, b = fit_logreg(Z[tr], Y[tr, j], l2=L2)
            oof[te, j] = sigmoid(Z[te] @ w + b)

    thresholds, report = [], {}
    for j, lab in enumerate(LABELS):
        best_t, best_f = 0.5, -1.0
        for t in np.arange(0.30, 0.76, 0.05):
            _, _, f = prf(Y[:, j], (oof[:, j] >= t).astype(int))
            if f > best_f:
                best_t, best_f = float(t), f
        p, r, f = prf(Y[:, j], (oof[:, j] >= best_t).astype(int))
        thresholds.append(best_t)
        report[lab] = {"threshold": round(best_t, 2), "precision": round(p, 3), "recall": round(r, 3), "f1": round(f, 3), "support": int(Y[:, j].sum())}
    macro_f1 = float(np.mean([v["f1"] for v in report.values()]))

    # ---- 전체 데이터로 최종 학습
    W = np.zeros((len(LABELS), X.shape[1]))
    B = np.zeros(len(LABELS))
    for j in range(len(LABELS)):
        W[j], B[j] = fit_logreg(Z, Y[:, j], l2=L2)

    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    np.savez(WEIGHTS_FILE, W=W, b=B, mu=mu, sd=sd, thresholds=np.array(thresholds))
    meta = {
        "labels": LABELS,
        "encoder": MODEL_ID,
        "n_train": len(texts),
        "cv": {"folds": K, "seed": SEED, "l2": L2, "macro_f1": round(macro_f1, 3)},
        "per_label": report,
        "trained_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n{K}-겹 교차검증 (학습에 쓰지 않은 문장 기준)  macro-F1 = {macro_f1:.3f}")
    print(f"{'라벨':24s}{'임계값':>7s}{'정밀도':>8s}{'재현율':>8s}{'F1':>7s}{'문장수':>7s}")
    for lab, v in report.items():
        print(f"{lab:24s}{v['threshold']:7.2f}{v['precision']:8.3f}{v['recall']:8.3f}{v['f1']:7.3f}{v['support']:7d}")
    print(f"\n저장: {WEIGHTS_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
