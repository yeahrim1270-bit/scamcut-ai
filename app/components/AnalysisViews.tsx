"use client";

import type { ActionGuardData, GuardAction, Level, MultiScanData, MultiScanEvidence, PhraseRef, PressureHit, Source, UrlInfo } from "@/lib/analysis";
import { CHANNEL_LABEL, type Channel } from "@/lib/types";
import { CHANNEL_ICON, fmtDateTime } from "./common";
import { Icon } from "./icons";

/* ---------- 공용 조각 ---------- */

const SOURCE_TEXT: Record<Source, string> = { model: "AI 모델", rule: "규칙", "model+rule": "AI 모델+규칙" };

// 이 항목이 AI 모델 판단인지, 규칙 판단인지 항상 구분해서 표시합니다.
export function SourceBadge({ source, score }: { source: Source; score?: number | null }) {
  return (
    <span className={`src src-${source === "model+rule" ? "both" : source}`} title={source === "rule" ? "키워드·주소 패턴 규칙으로 탐지" : "한국어 AI 모델(multilingual-e5)이 문장을 판단"}>
      {SOURCE_TEXT[source]}
      {score != null && source !== "rule" ? ` ${Math.round(score * 100)}%` : ""}
    </span>
  );
}

const LEVEL_CLS: Record<Level, string> = { low: "lv-low", caution: "lv-caution", high: "lv-high" };
const LEVEL_TEXT: Record<Level, string> = { low: "위험 징후 낮음", caution: "주의 필요", high: "위험 징후 높음" };

export function LevelBadge({ level, score }: { level: Level; score?: number }) {
  return <span className={`lvl ${LEVEL_CLS[level]}`}>{LEVEL_TEXT[level]}{score != null ? ` · ${score}` : ""}</span>;
}

// 근거 문장 인용. phrase(긴급 표현 등)가 있으면 그 부분을 강조합니다. start/phrase 위치는 자료 원문 기준.
export function Quote({ text, start, phrase, children }: { text: string; start: number; phrase?: PhraseRef | null; children?: React.ReactNode }) {
  let body: React.ReactNode = text;
  if (phrase) {
    const a = phrase.start - start;
    const b = phrase.end - start;
    if (a >= 0 && b <= text.length && b > a) {
      body = (<>{text.slice(0, a)}<mark>{text.slice(a, b)}</mark>{text.slice(b)}</>);
    }
  }
  return (
    <div className="quote">
      <span className="quote-text">“{body}”</span>
      {children}
    </div>
  );
}

function EvidenceTag({ channel, at }: { channel: string; at: string }) {
  const ch = channel as Channel;
  return (
    <span className="ev-tag">
      <Icon name={CHANNEL_ICON[ch] ?? "message-square"} size={13} /> {CHANNEL_LABEL[ch] ?? channel} · {at ? fmtDateTime(at) : "시각 미입력"}
    </span>
  );
}

const URL_RISK: Record<UrlInfo["risk"], { text: string; cls: string }> = {
  high: { text: "의심 높음", cls: "lv-high" },
  medium: { text: "주의", cls: "lv-caution" },
  unknown: { text: "확인 필요", cls: "lv-caution" },
  low: { text: "공식 주소로 보임", cls: "lv-low" },
};

function UrlRow({ u }: { u: UrlInfo }) {
  const r = URL_RISK[u.risk];
  return (
    <div className="item">
      <div className="item-head">
        <b className="mono">{u.domain}</b>
        <span className={`lvl ${r.cls}`}>{r.text}</span>
        <SourceBadge source="rule" />
      </div>
      <div className="item-note">{u.note}</div>
    </div>
  );
}

/* ---------- 위험 징후 경고 배너 ---------- */

export function WarningBanner({ level, headline }: { level: Level; headline: string }) {
  if (level === "low") return null;
  return (
    <div className={`warn-banner ${level}`} role="alert">
      <Icon name="shield" size={22} />
      <div>
        <b>{level === "high" ? "위험 징후가 발견됐어요" : "주의가 필요한 표현이 있어요"}</b>
        <p>{headline}</p>
      </div>
    </div>
  );
}

/* ---------- MULTI SCAN ---------- */

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grp">
      <div className="grp-title">{title}</div>
      {children}
    </div>
  );
}

function pressure(list: PressureHit[], title: string) {
  if (!list.length) return null;
  return (
    <Group title={title}>
      {list.map((h, i) => (
        <div className="item" key={i}>
          <Quote text={h.text} start={h.start} phrase={h.phrase}>
            <SourceBadge source={h.source} score={h.score} />
          </Quote>
        </div>
      ))}
    </Group>
  );
}

function EvidenceScan({ e, n }: { e: MultiScanEvidence; n: number }) {
  const hasAny = e.impersonation.length || e.topics.length || e.entities.urls.length || e.urgency.length || e.threats.length || e.secrecy.length || e.actions.length;
  return (
    <div className="scan-card">
      <div className="scan-head">
        <b>자료 {n}</b>
        <EvidenceTag channel={e.channel} at={e.occurred_at} />
        <LevelBadge level={e.risk.level} score={e.risk.score} />
      </div>
      <div className={`kind kind-${e.classification.kind}`}>{e.classification.label}</div>

      {e.impersonation.length > 0 && (
        <Group title="사칭 대상">
          {e.impersonation.map((m, i) => (
            <div className="item" key={i}>
              <div className="item-head"><b>{m.name ? `${m.category_name} · ${m.name}` : m.category_name}</b></div>
              <Quote text={m.text} start={m.start}><SourceBadge source={m.source} score={m.score} /></Quote>
            </div>
          ))}
        </Group>
      )}

      {e.topics.length > 0 && (
        <Group title="주요 주제">
          <div className="chips">
            {e.topics.slice(0, 3).map((t) => (
              <span className="chip" key={t.topic}>{t.name} <i>{Math.round(t.score * 100)}%</i></span>
            ))}
            <SourceBadge source="model" />
          </div>
        </Group>
      )}

      {e.entities.urls.length > 0 && (
        <Group title="URL">
          {e.entities.urls.map((u) => <UrlRow u={u} key={u.domain} />)}
        </Group>
      )}

      {pressure(e.urgency, "긴급성 표현")}
      {pressure(e.threats, "위협·불이익 표현")}
      {pressure(e.secrecy, "비밀 유지 요구")}

      {e.actions.length > 0 && (
        <Group title="요청 행동">
          {e.actions.map((a) => (
            <div className="item" key={a.label}>
              <div className="item-head"><b>{a.name}</b><SourceBadge source={a.source} /></div>
              {a.evidence.map((h, i) => (
                <Quote key={i} text={h.text} start={h.start}><SourceBadge source={h.source} score={h.score} /></Quote>
              ))}
            </div>
          ))}
        </Group>
      )}

      {!hasAny && <div className="muted small">추출된 위험 징후가 없습니다.</div>}
      {e.risk.reasons.length > 0 && <div className="reasons">종합 근거(규칙 기반 점수): {e.risk.reasons.join(" · ")}</div>}
    </div>
  );
}

export function MultiScanView({ data }: { data: MultiScanData }) {
  return (
    <div className="result-body">
      <div className="legend">
        <SourceBadge source="model" /> 한국어 AI 모델이 문장을 판단 · <SourceBadge source="rule" /> 키워드·주소 패턴 규칙 · <SourceBadge source="model+rule" /> 둘 다 탐지
      </div>
      {data.evidence.map((e, i) => <EvidenceScan key={e.evidence_id} e={e} n={i + 1} />)}
      <div className="model-note">
        사용 모델: {data.model.name}{data.model.classifier.cv_macro_f1 != null ? ` · 분류기 교차검증 F1 ${data.model.classifier.cv_macro_f1}` : ""} · {data.caveat}
      </div>
    </div>
  );
}

/* ---------- ACTION GUARD ---------- */

const SEV: Record<GuardAction["severity"], { text: string; cls: string }> = {
  high: { text: "높음", cls: "lv-high" },
  medium: { text: "주의", cls: "lv-caution" },
  low: { text: "낮음", cls: "lv-low" },
};

export function ActionGuardView({ data }: { data: ActionGuardData }) {
  return (
    <div className="result-body">
      {data.actions.length === 0 ? (
        <div className="muted small">{data.headline}</div>
      ) : (
        <>
          <div className="guard-head">{data.headline}</div>
          {data.actions.map((a) => (
            <div className="guard-card" key={a.action}>
              <div className="item-head">
                <b>{a.name}</b>
                <span className={`lvl ${SEV[a.severity].cls}`}>{SEV[a.severity].text}</span>
                <SourceBadge source={a.source} />
              </div>
              <div className="grp-title">근거 문장</div>
              {a.evidence.map((h, i) => (
                <div key={i}>
                  <EvidenceTag channel={h.channel} at={h.occurred_at} />
                  <Quote text={h.sentence.text} start={h.sentence.start}><SourceBadge source={h.source} score={h.score} /></Quote>
                </div>
              ))}
              <div className="why"><b>왜 위험한가요?</b><p>{a.why}</p></div>
              <div className="safe"><b>안전한 대응</b><p>{a.safe_response}</p></div>
            </div>
          ))}
        </>
      )}
      {data.links.length > 0 && (
        <Group title="자료에 포함된 링크">
          {data.links.map((u) => <UrlRow u={u} key={u.domain} />)}
        </Group>
      )}
      <div className="model-note">{data.caveat}</div>
    </div>
  );
}

/* ---------- 분석 결과 요약: 위험 징후 여부에 따라 스캔이가 달라집니다 ---------- */

// 위험·주의 → 경고하는 스캔이 / 위험 징후 없음 → 안심하는 스캔이
export function ResultHero({ level, headline }: { level: Level; headline: string }) {
  const risky = level !== "low";
  return (
    <div className="result-hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="result-mascot"
        src={risky ? "/images/scani-warning.png" : "/images/scani-safe.png"}
        alt={risky ? "위험 징후를 알리는 스캔이" : "위험 징후가 없다고 알리는 스캔이"}
        width={240}
        height={240}
        draggable={false}
      />
      {risky ? (
        <WarningBanner level={level} headline={headline} />
      ) : (
        <div className="warn-banner low" role="status">
          <Icon name="check-circle" size={22} />
          <div>
            <b>위험 징후가 발견되지 않았어요</b>
            <p>분석한 자료에서 위험 징후가 확인되지 않았어요. 그래도 낯선 요청은 직접 찾은 공식 경로로 한 번 더 확인하세요.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// 분석 결과 맨 위 요약: 발견된 위험 행동과 가장 중요한 대응 방법만 보여 줍니다. (자세한 내용은 아래에서 펼쳐 보기)
export function RiskSummary({ guard }: { guard: ActionGuardData }) {
  const acts = guard.actions.filter((a) => a.severity !== "low");
  if (!acts.length) return null;
  return (
    <div className="card sum-card">
      <div className="grp-title" style={{ marginTop: 0 }}>발견된 위험 행동</div>
      <div className="chips">
        {acts.map((a) => (
          <span key={a.action} className={`lvl ${SEV[a.severity].cls}`}>{a.name}</span>
        ))}
      </div>
      <div className="safe"><b>이렇게 대응하세요</b><p>{acts[0].safe_response}</p></div>
    </div>
  );
}
