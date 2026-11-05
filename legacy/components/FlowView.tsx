"use client";

import { LINK_THRESHOLD, groupingAgreement } from "@/lib/flow";
import {
  ACTION_LABEL,
  SCENARIO_LABEL,
  STAGE_LABEL,
  type AiResult,
  type EvidenceItem,
  type ItemRuleResult,
  type RuleFlowResult,
  type Stage,
} from "@/lib/types";
import { Ch, Risk, RiskBar, Src, fmtTime } from "./ui";

const STAGES: Stage[] = ["contact", "trust", "pressure", "execute"];

interface Props {
  items: EvidenceItem[];
  rules: Map<string, ItemRuleResult>;
  flow: RuleFlowResult;
  ai: AiResult | null;
}

function LinkGraph({ items, flow, ai }: Props) {
  const W = 340;
  const H = 240;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) / 2 - 34;
  const pos = new Map(
    items.map((it, i) => {
      const ang = (i / items.length) * Math.PI * 2 - Math.PI / 2;
      return [it.id, { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), it }];
    }),
  );
  const aiPairs = new Set<string>();
  ai?.incidents.forEach((inc) => {
    const ids = inc.item_ids;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) aiPairs.add([ids[i], ids[j]].sort().join("|"));
  });
  const ruleEdges = flow.edges.filter((e) => e.score >= LINK_THRESHOLD);
  const color = { sms: "var(--sms)", call: "var(--call)", messenger: "var(--messenger)" } as const;

  return (
    <svg className="graph" viewBox={`0 0 ${W} ${H}`}>
      {/* AI 연결 (보라 점선) */}
      {[...aiPairs].map((p) => {
        const [a, b] = p.split("|");
        const A = pos.get(a);
        const B = pos.get(b);
        if (!A || !B) return null;
        return <line key={"ai" + p} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="var(--ai)" strokeWidth={2} strokeDasharray="5 4" opacity={0.9} />;
      })}
      {/* 규칙 연결 (청록 실선, 점수 비례 두께) */}
      {ruleEdges.map((e) => {
        const A = pos.get(e.a)!;
        const B = pos.get(e.b)!;
        return (
          <g key={"r" + e.a + e.b}>
            <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="var(--rule)" strokeWidth={Math.min(6, 1 + e.score / 25)} opacity={0.75} />
            <text x={(A.x + B.x) / 2} y={(A.y + B.y) / 2 - 4} fill="#8be8dc" fontSize="10" textAnchor="middle">{e.score}</text>
          </g>
        );
      })}
      {[...pos.values()].map(({ x, y, it }) => (
        <g key={it.id}>
          <circle cx={x} cy={y} r={17} fill="var(--panel2)" stroke={color[it.channel]} strokeWidth={2.5} />
          <text x={x} y={y + 4} fill="#fff" fontSize="12" fontWeight="700" textAnchor="middle">{it.id}</text>
        </g>
      ))}
    </svg>
  );
}

export default function FlowView(props: Props) {
  const { items, rules, flow, ai } = props;
  const byId = new Map(items.map((it) => [it.id, it]));

  if (items.length < 2) {
    return <div className="empty">SCAM FLOW는 2개 이상의 자료가 있을 때 사건 연결을 분석합니다.<br />MULTI SCAN 탭에서 자료를 추가해 주세요.</div>;
  }

  const agreement = ai ? groupingAgreement(flow.incidents.map((i) => i.itemIds), ai.incidents.map((i) => i.item_ids)) : null;

  return (
    <>
      <div className="section-title"><span>사건 연결 그래프</span></div>
      <div className="card">
        <LinkGraph {...props} />
        <div className="row wrap small" style={{ gap: 10, marginTop: 8 }}>
          <span><span style={{ color: "var(--rule)" }}>━</span> 규칙 연결(숫자=연결점수, 기준 {LINK_THRESHOLD})</span>
          <span><span style={{ color: "var(--ai)" }}>┅</span> AI 연결</span>
        </div>
        {agreement !== null && (
          <div className="small" style={{ marginTop: 8 }}>
            AI ↔ 규칙 사건 묶음 일치도: <b>{Math.round(agreement * 100)}%</b>{" "}
            <span className="muted">(두 방식이 독립적으로 같은 연결을 찾을수록 높음)</span>
          </div>
        )}
      </div>

      {/* ---------- AI 사건 분석 ---------- */}
      <div className="section-title"><span>AI가 재구성한 사건</span><Src kind="ai" /></div>
      {!ai && <div className="notice">상단의 ‘AI 사건 분석’ 버튼을 누르면 Claude가 자료 간 맥락(예고된 연락의 이행, 시나리오의 논리적 연속 등)까지 읽어 사건을 재구성합니다.</div>}
      {ai && ai.incidents.length === 0 && <div className="notice">AI는 서로 연결된 사건을 찾지 못했습니다.</div>}
      {ai?.incidents.map((inc, k) => (
        <div className="card" key={k}>
          <div className="row between">
            <b>{inc.title}</b>
            <Risk score={inc.overall_risk_score} level={inc.overall_risk_level} />
          </div>
          <div className="row wrap small" style={{ gap: 6, margin: "6px 0" }}>
            <span className="chip">{inc.scam_type}</span>
            <span className="chip">연결 확신도 {inc.confidence}%</span>
            <span className="chip">자료 {inc.item_ids.join(" · ")}</span>
          </div>
          <RiskBar score={inc.overall_risk_score} />
          <div className="stages">
            {STAGES.map((s) => (
              <div key={s} className={`${s} ${inc.timeline.some((t) => t.stage === s) ? "on" : ""}`}>{STAGE_LABEL[s]}</div>
            ))}
          </div>
          <p style={{ margin: "8px 0", fontSize: 14 }}>{inc.narrative}</p>
          <div className="timeline">
            {inc.timeline.map((t, i) => {
              const it = byId.get(t.item_id);
              return (
                <div className={`tl-item ${t.stage}`} key={i}>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className={`stage ${t.stage}`}>{STAGE_LABEL[t.stage]}</span>
                    <span className="item-id">{t.item_id}</span>
                    {it && <Ch channel={it.channel} />}
                    {it && <span className="small muted">{fmtTime(it.occurredAt)}</span>}
                  </div>
                  <div style={{ fontSize: 13.5, marginTop: 2 }}>{t.description}</div>
                </div>
              );
            })}
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>연결 근거</div>
          <ul className="clean">{inc.link_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <div className="alert warn" style={{ marginTop: 10, marginBottom: 0 }}>
            <b>🔮 예상 다음 단계</b>
            <div style={{ fontSize: 13.5 }}>{inc.predicted_next_step}</div>
          </div>
        </div>
      ))}

      {/* ---------- 규칙 기반 사건 연결 ---------- */}
      <div className="section-title"><span>규칙 엔진이 연결한 사건</span><Src kind="rule" /></div>
      {flow.incidents.length === 0 && <div className="notice">공유 번호·계좌·인물·시나리오 등 연결 점수가 기준({LINK_THRESHOLD}점)을 넘는 자료 쌍이 없습니다.</div>}
      {flow.incidents.map((inc) => (
        <div className="card" key={inc.id}>
          <div className="row between">
            <b>사건 {inc.id} · {inc.scenario ? SCENARIO_LABEL[inc.scenario] : "유형 미상"}</b>
            <Risk score={inc.risk} level={inc.level} />
          </div>
          <RiskBar score={inc.risk} />
          <div className="stages">
            {STAGES.map((s) => (
              <div key={s} className={`${s} ${inc.stagesCovered.includes(s) ? "on" : ""}`}>{STAGE_LABEL[s]}</div>
            ))}
          </div>
          <p style={{ margin: "6px 0", fontSize: 13.5 }}>{inc.pattern}</p>
          <div className="timeline">
            {inc.itemIds.map((id) => {
              const it = byId.get(id)!;
              const r = rules.get(id)!;
              return (
                <div className={`tl-item ${r.stage}`} key={id}>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className={`stage ${r.stage}`}>{STAGE_LABEL[r.stage]}</span>
                    <span className="item-id">{id}</span>
                    <Ch channel={it.channel} />
                    <span className="small muted">{fmtTime(it.occurredAt)}</span>
                  </div>
                  <div className="small muted" style={{ marginTop: 2 }}>
                    {it.content.length > 70 ? it.content.slice(0, 70) + "…" : it.content}
                  </div>
                  {r.actions.length > 0 && (
                    <div className="small" style={{ color: "var(--danger)" }}>요구: {r.actions.map((a) => ACTION_LABEL[a.type]).join(", ")}</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="small muted">연결 근거 (자료 쌍별 점수)</div>
          {inc.edges.map((e) => (
            <div key={e.a + e.b} className="small" style={{ marginTop: 4 }}>
              <b>{e.a}↔{e.b}</b> <span className="chip rule">{e.score}점</span>
              <ul className="clean">{e.reasons.map((r, i) => <li key={i} style={{ fontSize: 12.5 }}>{r}</li>)}</ul>
            </div>
          ))}
          <div className="alert warn" style={{ marginTop: 10, marginBottom: 0 }}>
            <b>🔮 예상 다음 단계</b>
            <div style={{ fontSize: 13.5 }}>{inc.nextStep}</div>
          </div>
        </div>
      ))}

      {flow.unlinked.length > 0 && (
        <div className="notice">
          <Src kind="rule" /> 연결되지 않은 자료: {flow.unlinked.join(", ")}
          {ai && ai.unlinked_item_ids.length > 0 && <> · <Src kind="ai" /> {ai.unlinked_item_ids.join(", ")}</>}
        </div>
      )}
    </>
  );
}
