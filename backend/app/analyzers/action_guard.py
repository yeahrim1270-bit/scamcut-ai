"""ACTION GUARD — 위험 행동 예방.

송금 · 인증번호 · 카드정보 · 개인정보 입력 · 의심 링크 접속 · 원격제어 앱 설치 요구를 찾아
행동별로 '근거 문장 · 위험한 이유 · 안전한 대응 방법'을 제공합니다.
같은 NLP 분석 결과(모델 + 규칙)를 사용하며, 출처(source)는 항목마다 구분됩니다.
"""
from ..ml.intents import ACTIONS
from ..ml.pipeline import CAVEAT
from .base import AnalysisContext, AnalyzerOutput, BaseAnalyzer
from .nlp import get_nlp, nlp_readiness


def _severity(info, links: list[dict]) -> str:
    if info.code == "LINK":
        risks = {u["risk"] for u in links}
        return "high" if "high" in risks else "medium" if risks & {"medium", "unknown"} else "low"
    return "high" if info.weight >= 35 else "medium"


class ActionGuardAnalyzer(BaseAnalyzer):
    key = "action_guard"
    title = "ACTION GUARD"
    description = "송금·인증번호·카드/개인정보 입력·의심 링크·원격제어 앱 설치 요구 탐지"
    engine = "ai"  # AI 모델 + 규칙 병행
    implemented = True

    def readiness(self):
        return nlp_readiness()

    def run(self, ctx: AnalysisContext) -> AnalyzerOutput:
        res = get_nlp(ctx)
        grouped: dict[str, dict] = {}
        links: dict[str, dict] = {}
        for e in res["evidence"]:
            for u in e["entities"]["urls"]:
                links.setdefault(u["domain"], {**u, "evidence_id": e["evidence_id"]})
            for a in e["actions"]:
                g = grouped.setdefault(a["label"], {"info": ACTIONS[a["label"]], "items": [], "links": []})
                g["links"].extend(e["entities"]["urls"])
                for h in a["evidence"]:
                    g["items"].append({
                        "evidence_id": e["evidence_id"], "channel": e["channel"], "occurred_at": e["occurred_at"],
                        "sentence": {"idx": h["sentence_idx"], "text": h["text"], "start": h["start"], "end": h["end"]},
                        "source": h["source"], "score": h["score"], "evidence_risk": e["risk"]["level"],
                    })

        actions = []
        for lab, g in grouped.items():
            info = g["info"]
            sev = _severity(info, g["links"])
            srcs = {i["source"] for i in g["items"]}
            actions.append({
                "action": info.code, "name": info.name, "severity": sev,
                "why": info.why, "safe_response": info.safe,
                "source": "model+rule" if ("model+rule" in srcs or {"model", "rule"} <= srcs) else ("model" if "model" in srcs else "rule"),
                "evidence": g["items"],
            })
        actions.sort(key=lambda a: ({"high": 0, "medium": 1, "low": 2}[a["severity"]], a["name"]))

        level = res["overall"]["level"]
        if level != "low" and actions:
            names = ", ".join(a["name"] for a in actions if a["severity"] != "low") or ", ".join(a["name"] for a in actions)
            headline = f"다음 행동 요구가 발견됐어요: {names}. 지금은 따르지 말고, 직접 찾은 공식 번호로 먼저 확인하세요."
        else:
            headline = "확인된 위험 행동 요구는 없어요. 그래도 낯선 요청은 공식 경로로 한 번 더 확인하세요."

        if actions:
            detail = "\n".join(f"· {a['name']} ({ {'high':'높음','medium':'주의','low':'낮음'}[a['severity']] }) — 근거 {len(a['evidence'])}건" for a in actions) + "\n" + CAVEAT
        else:
            detail = "탐지된 위험 행동 요구가 없습니다.\n" + CAVEAT

        return AnalyzerOutput(
            summary=f"위험 행동 요구 {len(actions)}종 탐지" if actions else "위험 행동 요구 없음",
            detail=detail,
            verdict={"high": "danger", "caution": "caution", "low": "safe"}[level],
            data={
                "schema": "scamcut.actionguard.v1",
                "model": res["model"],
                "level": level,
                "headline": headline,
                "actions": actions,
                "links": list(links.values()),
                "evidence_risk": [{"evidence_id": e["evidence_id"], "level": e["risk"]["level"], "score": e["risk"]["score"], "label": e["risk"]["label"]} for e in res["evidence"]],
                "caveat": CAVEAT,
            },
        )
