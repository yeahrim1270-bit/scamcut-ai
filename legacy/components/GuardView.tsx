"use client";

import { useState } from "react";
import { ACTION_GUARD_TIPS } from "@/lib/verify";
import { ACTION_LABEL, type ActionType, type AiResult, type EvidenceItem, type ItemRuleResult, type RuleFlowResult } from "@/lib/types";
import { Src } from "./ui";

const ALL: ActionType[] = ["TRANSFER", "OTP", "PERSONAL_INFO", "LINK", "APP_INSTALL", "CASH", "GIFT_CARD"];
const ICON: Record<ActionType, string> = { TRANSFER: "💸", OTP: "🔢", PERSONAL_INFO: "🪪", LINK: "🔗", APP_INSTALL: "📲", CASH: "💵", GIFT_CARD: "🎁" };

interface Props {
  items: EvidenceItem[];
  rules: Map<string, ItemRuleResult>;
  flow: RuleFlowResult;
  ai: AiResult | null;
}

export default function GuardView({ items, rules, flow, ai }: Props) {
  const [intent, setIntent] = useState<ActionType | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // 자료별 탐지 근거 수집
  const ruleHits = new Map<ActionType, { id: string; kw: string[] }[]>();
  items.forEach((it) =>
    rules.get(it.id)?.actions.forEach((a) => ruleHits.set(a.type, [...(ruleHits.get(a.type) ?? []), { id: it.id, kw: a.matched }])),
  );
  const aiHits = new Map<ActionType, { id: string; why: string; ev: string }[]>();
  ai?.items.forEach((i) =>
    i.risky_actions.forEach((a) => aiHits.set(a.type, [...(aiHits.get(a.type) ?? []), { id: i.id, why: a.why_dangerous, ev: a.evidence }])),
  );

  const maxIncidentRisk = Math.max(0, ...flow.incidents.map((i) => i.risk), ...(ai?.incidents.map((i) => i.overall_risk_score) ?? []));

  const requested = (t: ActionType) => ruleHits.has(t) || aiHits.has(t);
  const tips = intent ? ACTION_GUARD_TIPS[intent] : null;
  const allChecked = tips ? tips.checks.every((_, i) => checked[`${intent}-${i}`]) : false;

  return (
    <>
      <div className="section-title"><span>ACTION GUARD · 지금 하려는 행동은?</span></div>
      <div className="notice" style={{ marginBottom: 10 }}>
        송금·인증번호 전달 등을 하기 <b>직전</b>에 선택하세요. 입력한 자료에서 해당 행동을 요구받았는지 교차 확인합니다.
      </div>
      <div className="guard-grid">
        {ALL.map((t) => (
          <button key={t} className={`${requested(t) ? "hit" : ""} ${intent === t ? "on" : ""}`} onClick={() => { setIntent(t); setChecked({}); }}>
            <div style={{ fontSize: 20 }}>{ICON[t]}</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{ACTION_LABEL[t]}</div>
            <div className="small" style={{ color: requested(t) ? "var(--danger)" : "var(--muted)" }}>
              {requested(t) ? "⚠ 자료에서 요구 탐지됨" : "요구 미탐지"}
            </div>
          </button>
        ))}
      </div>

      {intent && tips && (
        <div style={{ marginTop: 14 }}>
          {requested(intent) ? (
            <div className="alert">
              <h3>⛔ 멈추세요 — {ACTION_LABEL[intent]}</h3>
              <div style={{ fontSize: 14 }}>
                입력하신 자료에서 바로 이 행동을 요구한 정황이 있습니다.
                {maxIncidentRisk >= 70 && <> 연결된 사건의 위험도가 <b>{maxIncidentRisk}점</b>으로 매우 높습니다.</>}
              </div>
              <div style={{ marginTop: 8, fontSize: 14 }}>{tips.stop}</div>
            </div>
          ) : (
            <div className="alert warn">
              <h3>⚠ 실행 전 확인 — {ACTION_LABEL[intent]}</h3>
              <div style={{ fontSize: 14 }}>입력된 자료에서는 이 행동에 대한 직접 요구가 탐지되지 않았지만, 아래 항목을 확인하세요.</div>
              <div style={{ marginTop: 8, fontSize: 14 }}>{tips.stop}</div>
            </div>
          )}

          {(ruleHits.get(intent) || aiHits.get(intent)) && (
            <div className="card">
              <b className="small">탐지 근거</b>
              {ruleHits.get(intent)?.map((h, i) => (
                <div className="sig" key={"r" + i}><Src kind="rule" /> <b>{h.id}</b> <span className="kw">키워드: {h.kw.slice(0, 4).join(", ")}</span></div>
              ))}
              {aiHits.get(intent)?.map((h, i) => (
                <div className="sig" key={"a" + i}><Src kind="ai" /> <b>{h.id}</b> “{h.ev}” — {h.why}</div>
              ))}
            </div>
          )}

          <div className="card">
            <b className="small">진행 전 체크리스트</b>
            {tips.checks.map((c, i) => (
              <label className="check" key={i}>
                <input type="checkbox" checked={!!checked[`${intent}-${i}`]} onChange={(e) => setChecked({ ...checked, [`${intent}-${i}`]: e.target.checked })} />
                <span>{c}</span>
              </label>
            ))}
            <div className="small muted" style={{ marginTop: 8 }}>
              {allChecked
                ? requested(intent)
                  ? "모두 확인하셨더라도, 사기 정황이 있는 상대에게는 진행하지 말고 SAFE VERIFY 탭의 공식 경로로 먼저 확인하세요."
                  : "확인 완료. 그래도 의심스럽다면 SAFE VERIFY 탭에서 공식 경로를 이용하세요."
                : "모든 항목을 확인한 뒤에만 진행하세요."}
            </div>
          </div>
        </div>
      )}

      <div className="section-title"><span>전체 자료에서 탐지된 위험 행동 요구</span></div>
      <div className="card">
        {ALL.filter(requested).length === 0 && <div className="small muted">탐지된 위험 행동 요구가 없습니다.</div>}
        {ALL.filter(requested).map((t) => (
          <div key={t} className="row between" style={{ padding: "6px 0", borderBottom: "1px dashed var(--line)" }}>
            <span>{ICON[t]} {ACTION_LABEL[t]}</span>
            <span className="row" style={{ gap: 4 }}>
              {ruleHits.has(t) && <span className="chip rule">규칙 {ruleHits.get(t)!.map((h) => h.id).join(",")}</span>}
              {aiHits.has(t) && <span className="chip ai">AI {Array.from(new Set(aiHits.get(t)!.map((h) => h.id))).join(",")}</span>}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
