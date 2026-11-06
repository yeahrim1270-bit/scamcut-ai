"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAvailability, loadCached, prepare, runAiFlow, saveCached, type AiFlowRecord } from "@/lib/aiFlow";
import { sortChrono, type Evidence } from "@/lib/models";
import { CHANNEL_LABEL, STAGE_LABEL, type EvidenceItem } from "@/lib/types";
import { Quote } from "./AnalysisViews";
import { Notice, Sheet, fmtDateTime } from "./common";
import { Icon } from "./icons";

const RISK = {
  low: { text: "위험 징후 낮음", cls: "lv-low" },
  caution: { text: "주의 필요", cls: "lv-caution" },
  high: { text: "위험 징후 높음", cls: "lv-high" },
} as const;

// OpenAI 사건 해석: 외부 AI(OpenAI)가 자료 사이의 연결과 흐름을 해석합니다.
// 로컬 모델·규칙 분석과는 별개이며, 결과에 'OpenAI' 배지로 구분 표시합니다.
export default function AiFlowPanel({ incidentId, evidence }: { incidentId: string; evidence: Evidence[] }) {
  const ordered = useMemo(() => sortChrono(evidence), [evidence]);
  const items: EvidenceItem[] = useMemo(
    () => ordered.map((e, i) => ({ id: `E${i + 1}`, channel: e.channel, sender: e.sender, occurredAt: e.occurredAt, content: e.content })),
    [ordered],
  );
  const prep = useMemo(() => prepare(items), [items]);

  const [avail, setAvail] = useState<{ available: boolean; model: string } | null>(null);
  const [rec, setRec] = useState<AiFlowRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [open, setOpen] = useState(false); // 기본은 접힌 상태, 해석이 끝나면 펼쳐서 보여 줌

  useEffect(() => {
    fetchAvailability().then(setAvail);
  }, []);
  useEffect(() => {
    setRec(loadCached(incidentId));
    setError(null);
  }, [incidentId]);

  const stale = !!rec && rec.sig !== prep.sig;
  const meta = (id: string) => {
    const e = ordered[Number(id.replace("E", "")) - 1];
    return e ? `${CHANNEL_LABEL[e.channel]} · ${e.occurredAt ? fmtDateTime(e.occurredAt) : "시각 미입력"}` : id;
  };

  const run = async () => {
    setConsent(false);
    setLoading(true);
    setError(null);
    const r = await runAiFlow(prep.masked);
    setLoading(false);
    if (!r.ok) return setError(r.error);
    const next: AiFlowRecord = { sig: prep.sig, at: new Date().toISOString(), model: r.model, result: r.result };
    saveCached(incidentId, next);
    setRec(next);
    setOpen(true);
  };

  const maskedTotal = Object.values(prep.report).reduce((a, b) => a + b, 0);
  const x = rec?.result;

  return (
    <details className="card acc ai-card" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="acc-sum">
        <span className="sec-ic"><Icon name="network" size={22} /></span>
        <span className="grow">
          <b className="sec-name">AI 사건 해석</b>
          <small>외부 AI(OpenAI)가 사건의 흐름을 해석</small>
        </span>
        <span className="src src-ext">OpenAI</span>
        <span className="acc-chev"><Icon name="chevron-right" size={18} /></span>
      </summary>
      <div className="acc-body">
      <p className="small muted" style={{ margin: "12px 0 10px" }}>
        자료 사이의 연결과 사건의 흐름을 해석해요. 위의 AI 모델·규칙 분석과는 별개의 결과예요.{avail?.model ? ` (${avail.model})` : ""}
      </p>

      <button className="btn primary block" onClick={() => setConsent(true)} disabled={loading || avail?.available === false}>
        {loading ? <><span className="spinner" /> OpenAI가 해석하는 중…</> : <><Icon name="network" size={18} /> {rec ? "다시 해석하기" : "OpenAI로 사건 해석하기"}</>}
      </button>
      {avail?.available === false && <div style={{ marginTop: 8 }}><Notice icon="info">서버에 <code>OPENAI_API_KEY</code>가 설정되지 않아 사용할 수 없어요.</Notice></div>}
      {error && <div className="sec-note" role="alert" style={{ marginLeft: 0, marginTop: 8, color: "var(--danger)" }}>{error}</div>}

      {x && (
        <div className="result-body">
          {stale && <div className="sec-note" style={{ marginLeft: 0 }}>자료가 바뀌었어요. 이 해석은 이전 자료 기준이에요. ‘다시 해석하기’를 눌러 주세요.</div>}
          <div className="scan-head" style={{ marginTop: 8 }}>
            <span className={`lvl ${RISK[x.risk_level].cls}`}>{RISK[x.risk_level].text}</span>
            <span className="chip">{x.is_linked ? "자료들이 한 사건으로 이어져 보여요" : "서로 이어지는 근거는 약해요"}</span>
          </div>
          <div className="kind" style={{ marginTop: 10 }}>{x.headline}</div>
          <div className="small muted" style={{ marginBottom: 6 }}>{x.scam_type}</div>
          <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.6 }}>{x.narrative}</p>

          {x.timeline.length > 0 && (
            <div className="grp">
              <div className="grp-title">사건 흐름</div>
              {x.timeline.map((t, i) => (
                <div className="item" key={i}>
                  <div className="item-head"><b>{STAGE_LABEL[t.stage]}</b><span className="ev-tag">{t.item} · {meta(t.item)}</span></div>
                  <div className="item-note">{t.description}</div>
                </div>
              ))}
            </div>
          )}

          {x.link_reasons.length > 0 && (
            <div className="grp">
              <div className="grp-title">연결 근거</div>
              <ul className="g-list">{x.link_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}

          {x.suspicious_points.length > 0 && (
            <div className="grp">
              <div className="grp-title">의심되는 표현 (원문 인용은 서버가 원문과 일치하는지 확인했어요)</div>
              {x.suspicious_points.map((p, i) => (
                <div className="item" key={i}>
                  {p.quote_verified ? <Quote text={p.quote} start={0} /> : null}
                  <div className="item-note"><span className="ev-tag">{p.item}</span> {p.reason}</div>
                </div>
              ))}
            </div>
          )}

          <div className="why"><b>이어질 수 있는 다음 단계</b><p>{x.predicted_next_step}</p></div>

          <div className="safe">
            <b>지금 해야 할 일</b>
            <ol className="steps" style={{ margin: "6px 0 0" }}>
              {[...x.safe_actions].sort((a, b) => a.priority - b.priority).map((a, i) => (
                <li key={i}><b>{a.action}</b><div className="small muted">{a.reason}</div></li>
              ))}
            </ol>
          </div>

          {x.verify_targets.length > 0 && (
            <div className="grp">
              <div className="grp-title">상대가 밝힌 신원 확인하기</div>
              {x.verify_targets.map((v, i) => (
                <div className="item" key={i}><b>“{v.claimed_identity}”</b><div className="item-note">{v.how_to_verify}</div></div>
              ))}
            </div>
          )}

          <div className="model-note">
            {rec?.model} · 개인정보를 가린 자료 기준 · {fmtDateTime(rec!.at)} · AI 해석은 참고용이며 사기 여부를 확정하지 않아요. 공식 경로로 직접 확인하세요.
          </div>
        </div>
      )}

      {consent && (
        <Sheet title="OpenAI로 자료를 보내요" onClose={() => setConsent(false)}>
          <p className="small" style={{ marginTop: 0 }}>
            이 해석을 위해 자료 {items.length}개가 <b>외부 서비스(OpenAI)</b>로 전송돼요. 전화번호·계좌번호·주민번호·카드번호·인증번호·이메일은 <b>이 기기에서 먼저 가려지며</b>({maskedTotal}건), 서버는 자료를 저장하지 않아요.
          </p>
          <details style={{ marginBottom: 12 }}>
            <summary className="small" style={{ cursor: "pointer", color: "var(--primary)", fontWeight: 700 }}>실제 전송되는 내용 미리보기</summary>
            {prep.masked.map((m) => (
              <div className="quote" key={m.id} style={{ marginTop: 6 }}><span className="quote-text"><b>{m.id}</b> [{m.sender || "발신자 미상"}] {m.content}</span></div>
            ))}
          </details>
          <div className="stack">
            <button className="btn primary block lg" onClick={run}>동의하고 해석하기</button>
            <button className="btn block ghost" onClick={() => setConsent(false)}>취소</button>
          </div>
        </Sheet>
      )}
      </div>
    </details>
  );
}
