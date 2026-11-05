"use client";

import { useState } from "react";
import { SAMPLE_SETS } from "@/lib/samples";
import { ACTION_LABEL, type AiItem, type Channel, type EvidenceItem, type ItemRuleResult } from "@/lib/types";
import { Ch, Risk, RiskBar, Src, fmtTime } from "./ui";

interface Props {
  items: EvidenceItem[];
  rules: Map<string, ItemRuleResult>;
  aiItems: Map<string, AiItem> | null;
  onAdd: (it: Omit<EvidenceItem, "id">) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onLoadSample: (idx: number) => void;
}

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function ScanView({ items, rules, aiItems, onAdd, onRemove, onClear, onLoadSample }: Props) {
  const [channel, setChannel] = useState<Channel>("sms");
  const [sender, setSender] = useState("");
  const [occurredAt, setOccurredAt] = useState(nowLocal());
  const [content, setContent] = useState("");

  const submit = () => {
    if (!content.trim()) return;
    onAdd({ channel, sender: sender.trim(), occurredAt, content: content.trim() });
    setContent("");
    setSender("");
  };

  return (
    <>
      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <b>자료 추가</b>
          <span className="small muted">문자·통화 메모·메신저 대화</span>
        </div>
        <div className="seg" style={{ marginBottom: 10 }}>
          {(["sms", "call", "messenger"] as Channel[]).map((c) => (
            <button key={c} className={channel === c ? "on" : ""} onClick={() => setChannel(c)}>
              {c === "sms" ? "✉️ 문자" : c === "call" ? "📞 전화" : "💬 메신저"}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div className="field grow">
            <label>발신번호 / 대화명</label>
            <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="예: 02-1234-5678" />
          </div>
          <div className="field grow">
            <label>수신 시각</label>
            <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>{channel === "call" ? "통화 내용 메모 (상대가 한 말을 적어주세요)" : "내용 붙여넣기"}</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="받은 메시지나 통화 내용을 그대로 입력하세요." maxLength={3000} />
        </div>
        <button className="btn primary block" onClick={submit} disabled={!content.trim() || items.length >= 15}>
          + 자료 추가 ({items.length}/15)
        </button>
        <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
          <span className="small muted">입력 예시:</span>
          {SAMPLE_SETS.map((s, i) => (
            <button key={i} className="btn sm" onClick={() => onLoadSample(i)}>
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="section-title">
        <span>MULTI SCAN · 자료별 위험 징후</span>
        {items.length > 0 && (
          <button className="btn sm" onClick={onClear}>
            전체 삭제
          </button>
        )}
      </div>

      {items.length === 0 && <div className="empty">아직 입력된 자료가 없습니다.<br />의심스러운 문자·통화·메신저 내용을 추가해 보세요.</div>}

      {items.map((it) => {
        const r = rules.get(it.id)!;
        const ai = aiItems?.get(it.id);
        return (
          <div className="card" key={it.id}>
            <div className="item-head">
              <span className="item-id">{it.id}</span>
              <Ch channel={it.channel} />
              <span className="small muted">{it.sender || "발신자 미상"} · {fmtTime(it.occurredAt)}</span>
              <span className="grow" />
              <button className="btn sm" onClick={() => onRemove(it.id)} aria-label="삭제">✕</button>
            </div>
            <div className="quote">{it.content}</div>

            <div className="compare">
              <div>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <Src kind="rule" />
                  <Risk score={r.score} level={r.level} />
                </div>
                <RiskBar score={r.score} />
                {r.signals.length === 0 && r.actions.length === 0 && <div className="sig muted">탐지된 규칙 없음</div>}
                {r.signals.map((s) => (
                  <div className="sig" key={s.id}>
                    <b>{s.label}</b> <span className="kw">({s.matched.slice(0, 3).join(", ")})</span>
                  </div>
                ))}
                {r.actions.map((a) => (
                  <div className="sig" key={a.type} style={{ color: "var(--danger)" }}>
                    ⚠ <b>{ACTION_LABEL[a.type]} 요구</b>
                  </div>
                ))}
              </div>
              <div>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <Src kind="ai" />
                  {ai ? <Risk score={ai.risk_score} level={ai.risk_level} /> : <span className="small muted">대기</span>}
                </div>
                {ai ? (
                  <>
                    <RiskBar score={ai.risk_score} />
                    <div className="sig"><b>{ai.scam_type}</b></div>
                    <div className="sig muted">{ai.summary}</div>
                    {ai.signals.slice(0, 4).map((s, i) => (
                      <div className="sig" key={i}>
                        <b>{s.label}</b> <span className="kw">“{s.evidence}”</span>
                      </div>
                    ))}
                    {ai.risky_actions.map((a, i) => (
                      <div className="sig" key={i} style={{ color: "var(--danger)" }}>
                        ⚠ <b>{ACTION_LABEL[a.type] ?? a.type}</b>: {a.why_dangerous}
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="sig muted">상단 ‘AI 사건 분석’을 실행하면 Claude의 분석이 표시됩니다.</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
