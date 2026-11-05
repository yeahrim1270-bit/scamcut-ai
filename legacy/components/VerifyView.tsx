"use client";

import { EMERGENCY_STEPS, OFFICIAL_CONTACTS, SCENARIO_VERIFY } from "@/lib/verify";
import { SCENARIO_LABEL, type AiResult, type ItemRuleResult, type RuleFlowResult, type ScenarioId } from "@/lib/types";
import { Src } from "./ui";

interface Props {
  rules: Map<string, ItemRuleResult>;
  flow: RuleFlowResult;
  ai: AiResult | null;
}

export default function VerifyView({ rules, flow, ai }: Props) {
  // 사건 시나리오 우선, 그 다음 개별 자료에서 탐지된 시나리오
  const scen: ScenarioId[] = [];
  flow.incidents.forEach((i) => i.scenario && !scen.includes(i.scenario) && scen.push(i.scenario));
  [...rules.values()]
    .filter((r) => r.score >= 30)
    .forEach((r) => r.scenarios.forEach((s) => !scen.includes(s) && scen.push(s)));

  return (
    <>
      {ai && ai.safe_actions.length > 0 && (
        <>
          <div className="section-title"><span>지금 해야 할 안전 행동</span><Src kind="ai" /></div>
          <div className="card">
            {[...ai.safe_actions].sort((a, b) => a.priority - b.priority).map((s, i) => (
              <div key={i} style={{ padding: "6px 0", borderBottom: "1px dashed var(--line)" }}>
                <b>{i + 1}. {s.action}</b>
                <div className="small muted">{s.reason}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {ai && ai.verify_targets.length > 0 && (
        <>
          <div className="section-title"><span>상대가 주장한 신원 확인하기</span><Src kind="ai" /></div>
          <div className="card">
            {ai.verify_targets.map((v, i) => (
              <div key={i} style={{ padding: "6px 0", borderBottom: "1px dashed var(--line)" }}>
                <b>“{v.claimed_identity}”</b>
                <div style={{ fontSize: 13.5 }}>{v.how_to_verify}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title"><span>유형별 공식 확인 방법</span><Src kind="rule" /></div>
      {scen.length === 0 && <div className="notice">특정 사기 유형이 탐지되지 않았습니다. 아래 공식 연락처는 언제든 이용할 수 있습니다.</div>}
      {scen.map((s) => (
        <div className="card" key={s}>
          <b>{SCENARIO_LABEL[s]}</b>
          <div className="alert ok" style={{ margin: "8px 0", padding: 10 }}>
            <div style={{ fontSize: 13.5 }}>✅ {SCENARIO_VERIFY[s].truth}</div>
          </div>
          <ul className="clean">{SCENARIO_VERIFY[s].verify.map((v, i) => <li key={i}>{v}</li>)}</ul>
        </div>
      ))}

      <div className="section-title"><span>공식 신고·확인 경로</span></div>
      <div className="card">
        {OFFICIAL_CONTACTS.map((c) => (
          <div className="contact" key={c.name}>
            <div>
              <b style={{ fontSize: 14 }}>{c.name}</b>
              <div className="small muted">{c.desc}</div>
            </div>
            {c.tel ? (
              <a className="callbtn" href={`tel:${c.tel}`}>📞 {c.tel}</a>
            ) : (
              <a className="callbtn link" href={c.url} target="_blank" rel="noopener noreferrer">열기 ↗</a>
            )}
          </div>
        ))}
      </div>

      <div className="section-title"><span>이미 피해가 발생했다면</span></div>
      <div className="card">
        <ul className="clean">{EMERGENCY_STEPS.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </div>
      <div className="notice">⚠ 자료에 적힌 전화번호·링크로는 절대 확인하지 마세요. 반드시 직접 검색한 공식 대표번호를 이용하세요.</div>
    </>
  );
}
