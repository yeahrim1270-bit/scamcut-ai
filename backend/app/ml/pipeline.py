"""MULTI SCAN / ACTION GUARD 공용 분석 파이프라인.

처리 순서
 1) 문장 분리 (규칙)
 2) 문장 임베딩 + 분류기 → 라벨별 확률 (AI 모델: multilingual-e5-small + 학습된 분류기)
 3) 같은 문장에 규칙(요청 문형·URL·기관명·긴급 표현)을 적용 — 모델 결과와 따로 기록(source)
 4) 근거 문장과 함께 사칭 대상·주제·URL·긴급성·요청 행동을 구조화
 5) 규칙 기반 종합 점수로 '위험 징후 수준' 산정 (사기를 확정하지 않음)

모든 결과 항목에는 source 가 있습니다: "model"(AI 모델) · "rule"(규칙) · "model+rule"(둘 다 탐지).
"""
import time
from typing import Any, Optional

import numpy as np

from . import lexicon as lx
from .encoder import get_encoder
from .heads import load_heads
from .intents import (
    ACTION_LABELS, ACTIONS, IMPERSONATION_LABELS, LABEL_KO, LABELS, PRESSURE_LABELS, TOPIC_LABELS,
)
from .model_spec import MODEL_DIR, MODEL_ID

MIN_THRESHOLD = 0.40  # 교차검증으로 정한 임계값이 너무 낮아도 이 값 아래로는 내려가지 않음
BENIGN_GATE = 0.60  # '일반 안내' 확률이 이 이상이고 다른 신호가 약하면 모델 단독 탐지는 무시(경고 문구 오탐 방지)
LEVEL_HIGH, LEVEL_CAUTION = 55, 25

KIND_LABEL = {
    "normal_notice": "일반 안내로 보임",
    "needs_check": "확인이 필요한 요청",
    "suspicious": "사기 의심 징후가 여러 개 있음",
}
LEVEL_LABEL = {"low": "위험 징후 낮음", "caution": "주의 필요", "high": "위험 징후 높음"}
CAVEAT = "AI 분석은 참고용입니다. 사기 여부를 확정하지 않으며, 공식 경로로 직접 확인해야 합니다."

_PRESSURE_PHRASES = {"urgency": lx.URGENCY_PHRASES, "threat": lx.THREAT_PHRASES, "secrecy": lx.SECRECY_PHRASES}
_PRESSURE_POINTS = {"urgency": 8, "threat": 12, "secrecy": 15}


def _revision() -> str:
    f = MODEL_DIR / "REVISION"
    return f.read_text(encoding="utf-8").strip() if f.exists() else MODEL_ID


def _span(seg) -> dict:
    return {"sentence_idx": seg.idx, "text": seg.text, "start": seg.start, "end": seg.end}


def analyze_evidence(items: list) -> dict:
    """items: EvidenceView 목록 → 구조화된 분석 결과."""
    t0 = time.time()
    heads = load_heads()
    enc = get_encoder()

    segs_by_item = [lx.segment(it.content) for it in items]
    flat = [(i, s) for i, segs in enumerate(segs_by_item) for s in segs]
    probs = heads.predict(enc.encode([s.text for _, s in flat])) if flat else np.zeros((0, len(LABELS)))
    li = {l: heads.labels.index(l) for l in LABELS}
    thr = {l: max(heads.threshold(l), MIN_THRESHOLD) for l in LABELS}

    # 증거 항목별 문장 확률 묶기
    cursor = 0
    results = []
    for it, segs in zip(items, segs_by_item):
        p = probs[cursor : cursor + len(segs)]
        cursor += len(segs)
        results.append(_analyze_one(it, segs, p, li, thr))

    overall_level = "high" if any(r["risk"]["level"] == "high" for r in results) else "caution" if any(r["risk"]["level"] == "caution" for r in results) else "low"
    return {
        "schema": "scamcut.nlp.v1",
        "model": {
            "name": MODEL_ID,
            "revision": _revision(),
            "classifier": {"n_train": heads.meta.get("n_train"), "cv_macro_f1": (heads.meta.get("cv") or {}).get("macro_f1"), "trained_at": heads.meta.get("trained_at")},
            "runtime": "onnxruntime-cpu",
        },
        "evidence": results,
        "overall": {"level": overall_level, "label": LEVEL_LABEL[overall_level], "counts": {lv: sum(1 for r in results if r["risk"]["level"] == lv) for lv in ("high", "caution", "low")}},
        "caveat": CAVEAT,
        "elapsed_ms": int((time.time() - t0) * 1000),
    }


def _analyze_one(it, segs, P, li: dict, thr: dict) -> dict:
    text = it.content
    urls = lx.extract_urls(text)
    nums = lx.extract_numbers(text)

    # 인증번호가 이미 적힌 정상 발송 문자('인증번호 [482019] 를 입력해 주세요 … 타인에게 알려주지 마세요')는
    # 문장 속 경고 문구를 압박·사칭으로 오인하지 않도록 해당 항목 추출에서 제외합니다.
    otp_notice = any(lx.otp_delivery_notice(s.text) for s in segs)

    sentences, benign_max = [], 0.0
    actions: dict[str, list[dict]] = {}
    pressure: dict[str, list[dict]] = {}
    imp: list[dict] = []
    topics: dict[str, dict] = {}

    for s, row in zip(segs, P):
        benign = float(row[li["benign"]])
        benign_max = max(benign_max, benign)
        in_url = [u for u in urls if u["start"] >= s.start and u["end"] <= s.end]
        rules = lx.rule_actions(s.text, has_url=bool(in_url))

        top = sorted(((float(row[li[l]]), l) for l in LABELS if row[li[l]] >= 0.30), reverse=True)[:4]
        sentences.append({**_span(s), "benign": round(benign, 3), "labels": [{"label": l, "name": LABEL_KO.get(l) or ACTIONS[l].name, "score": round(v, 3)} for v, l in top]})

        # ---- 요청 행동: 모델 + 규칙
        for lab in ACTION_LABELS:
            pr = float(row[li[lab]])
            model_hit = pr >= thr[lab]
            rule_hit = lab in rules
            if model_hit and not rule_hit and benign >= BENIGN_GATE and pr < 0.80:
                model_hit = False  # 경고·안내 문구를 요청으로 오인하지 않도록
            if lab == "ask_otp" and lx.otp_delivery_notice(s.text):
                model_hit = False  # 인증번호가 이미 적힌 정상 발송 문자
            if model_hit and not rule_hit and lx.is_negated(s.text):
                model_hit = False  # '알려주지 마세요' 같은 부정 요청은 요구가 아님
            if not (model_hit or rule_hit):
                continue
            actions.setdefault(lab, []).append({
                **_span(s), "source": "model+rule" if model_hit and rule_hit else "model" if model_hit else "rule",
                "score": round(pr, 3) if model_hit else None,
            })

        # ---- 압박: 모델이 판단, 규칙은 표현(구절) 위치만 찾음
        for lab in PRESSURE_LABELS:
            pr = float(row[li[lab]])
            if otp_notice or pr < thr[lab] or (benign >= BENIGN_GATE and pr < 0.70):
                continue
            ph = lx.find_phrase(s.text, _PRESSURE_PHRASES[lab])
            pressure.setdefault(lab, []).append({
                **_span(s), "source": "model+rule" if ph else "model", "score": round(pr, 3),
                "phrase": {"text": ph[0], "start": s.start + ph[1], "end": s.start + ph[2]} if ph else None,
            })

        # ---- 사칭 대상: 모델이 판단, 이름은 사전에서 찾음
        #      계좌번호가 적힌 줄은 '계좌 안내'이지 자기소개가 아니므로 사칭으로 보지 않음
        if not lx.ACCOUNT_RE.search(s.text):
            for lab in IMPERSONATION_LABELS:
                pr = float(row[li[lab]])
                if pr < thr[lab] or (benign >= BENIGN_GATE and pr < 0.70):
                    continue
                cat, name = lab, None
                if lab == "imp_family":
                    name = lx.find_org(s.text, lab)
                else:  # 문장에 기관명이 있으면 사전의 분류를 따름 (예: 금융감독원 → 수사·금융당국)
                    for c in ("imp_authority", "imp_finance", "imp_courier", "imp_service"):
                        n = lx.find_org(s.text, c)
                        if n:
                            cat, name = c, n
                            break
                if any(i["category"] == cat and i["sentence_idx"] == s.idx for i in imp):
                    continue
                imp.append({"category": cat, "category_name": LABEL_KO[cat], "name": name, **_span(s), "source": "model+rule" if name else "model", "score": round(pr, 3)})

        # ---- 주제
        for lab in TOPIC_LABELS:
            pr = float(row[li[lab]])
            if pr >= thr[lab] and (lab not in topics or pr > topics[lab]["score"]):
                topics[lab] = {"topic": lab, "name": LABEL_KO[lab], "score": round(pr, 3), **_span(s), "source": "model"}

    # URL 위험도만으로도 링크 접속 위험을 알림 (모델이 못 잡은 경우)
    risky_urls = [u for u in urls if u["risk"] in ("high", "medium")]
    if risky_urls and "ask_link" not in actions:
        u = risky_urls[0]
        seg = next((s for s in segs if s.start <= u["start"] < s.end or s.start <= u["start"] <= s.end), None)
        if seg:
            actions["ask_link"] = [{**_span(seg), "source": "rule", "score": None}]

    risk = _score(actions, pressure, imp, topics, urls, benign_max)
    kind = _kind(risk, actions, benign_max)

    return {
        "evidence_id": it.id, "channel": it.channel, "occurred_at": it.occurred_at,
        "sentences": sentences,
        "entities": {"urls": urls, **nums, "orgs": lx.find_all_orgs(text)},
        "impersonation": imp,
        "topics": sorted(topics.values(), key=lambda t: -t["score"]),
        "urgency": pressure.get("urgency", []),
        "threats": pressure.get("threat", []),
        "secrecy": pressure.get("secrecy", []),
        "actions": [_action_out(lab, hits, urls) for lab, hits in actions.items()],
        "classification": {"kind": kind, "label": KIND_LABEL[kind], "benign_score": round(benign_max, 3)},
        "risk": risk,
    }


def _action_out(lab: str, hits: list[dict], urls: list[dict]) -> dict:
    info = ACTIONS[lab]
    srcs = {h["source"] for h in hits}
    both = "model+rule" in srcs or ("model" in srcs and "rule" in srcs)
    return {
        "action": info.code, "label": lab, "name": info.name, "weight": info.weight,
        "source": "model+rule" if both else ("model" if "model" in srcs else "rule"),
        "evidence": hits,
        "links": [u for u in urls if lab == "ask_link"],
    }


def _score(actions, pressure, imp, topics, urls, benign_max) -> dict:
    """규칙 기반 종합 점수(0~100). 모델 확률이 아니라, 탐지된 신호를 가중 합산하는 투명한 계산입니다."""
    reasons: list[str] = []
    parts: list[float] = []
    worst_url = max((u["points"] for u in urls), default=0)
    for lab, hits in actions.items():
        info = ACTIONS[lab]
        srcs = {h["source"] for h in hits}
        conf = 1.0 if ("model+rule" in srcs or {"model", "rule"} <= srcs) else 0.85 if "model" in srcs else 0.65
        pts = info.weight * conf
        if lab == "ask_link":
            pts += worst_url
            if worst_url >= 30:
                reasons.append("의심스러운 주소로의 접속 유도")
        parts.append(pts)
        reasons.append(f"{info.name}")
    parts.sort(reverse=True)
    score = (parts[0] if parts else 0) + 0.5 * (parts[1] if len(parts) > 1 else 0) + 0.25 * sum(parts[2:])

    press = sum(_PRESSURE_POINTS[k] for k in pressure)
    score += min(press, 28)
    reasons += [{"urgency": "긴급성 압박", "threat": "위협·불이익 언급", "secrecy": "비밀 유지 요구"}[k] for k in pressure]

    imp_cats = {i["category"] for i in imp}
    score += min(10 * len(imp_cats), 20)
    reasons += [f"{LABEL_KO[c]} 사칭 표현" for c in imp_cats]

    if actions and (imp_cats or topics.keys() & {"topic_legal", "topic_family_emergency"}):
        score += 15
    if actions and pressure:
        score += 10
    if not actions and worst_url >= 30:
        score += worst_url  # 행동 요청 문장은 못 찾았지만 위장 주소가 있는 경우
        reasons.append("공식을 흉내 낸 의심 주소 포함")

    if benign_max >= BENIGN_GATE and not actions and worst_url < 30:
        score = min(score, 12)  # 일반 안내로 보이고 행동 요구가 없으면 낮게 유지
    score = int(max(0, min(100, round(score))))
    level = "high" if score >= LEVEL_HIGH else "caution" if score >= LEVEL_CAUTION else "low"
    return {"score": score, "level": level, "label": LEVEL_LABEL[level], "reasons": list(dict.fromkeys(reasons))}


def _kind(risk: dict, actions: dict, benign_max: float) -> str:
    if risk["level"] == "high" or (risk["level"] == "caution" and len(actions) >= 2):
        return "suspicious"
    if risk["level"] == "caution":
        return "needs_check"
    return "normal_notice" if benign_max >= 0.4 or not actions else "needs_check"
