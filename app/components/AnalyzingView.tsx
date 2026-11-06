"use client";

import type { AnalysisJob, AnalyzerInfo, AnalyzerKey, JobStatus } from "@/lib/models";
import { Icon } from "./icons";

const ROWS: { key: AnalyzerKey; name: string; desc: string }[] = [
  { key: "multi_scan", name: "MULTI SCAN", desc: "위험 신호 추출" },
  { key: "scam_flow", name: "SCAM FLOW", desc: "관련 자료 비교" },
  { key: "action_guard", name: "ACTION GUARD", desc: "위험 행동 분석" },
];

type RowState = JobStatus | "wait" | "soon";

// 분석 중 화면: 서버가 실제로 처리 중인 분석 단계(상태)를 그대로 보여 줍니다.
// 아직 구현되지 않은 분석기는 '준비 중'으로 표시하고, 진행률에도 포함하지 않습니다.
export default function AnalyzingView({ job, caps }: { job: AnalysisJob | undefined; caps: Map<AnalyzerKey, AnalyzerInfo> }) {
  const state = (key: AnalyzerKey): RowState => {
    const step = job?.steps.find((s) => s.key === key);
    if (step) return step.status;
    const c = caps.get(key);
    return c && !c.implemented ? "soon" : "wait";
  };
  const real = ROWS.filter((r) => state(r.key) !== "soon");
  const done = real.filter((r) => state(r.key) === "succeeded" || state(r.key) === "failed").length;
  const running = real.filter((r) => state(r.key) === "running").length;
  const pct = real.length ? Math.max(8, Math.round(((done + running * 0.5) / real.length) * 100)) : 8;

  return (
    <div className="analyzing">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="analyzing-mascot" src="/images/scani-analyzing.png" alt="자료를 분석 중인 스캔이" width={260} height={233} draggable={false} />
      <h2>스캔이가 자료를 분석하고 있어요!</h2>
      <p className="muted small">잠시만 기다려 주세요. 다른 화면으로 가도 분석은 계속돼요.</p>

      <div className="a-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <i style={{ width: `${pct}%` }} />
      </div>

      <ul className="a-steps">
        {ROWS.map((r) => {
          const s = state(r.key);
          return (
            <li key={r.key} className={`a-step s-${s}`}>
              <span className="a-ic">
                {s === "succeeded" ? <Icon name="check-circle" size={20} /> : s === "running" ? <span className="spinner dark" /> : s === "failed" ? <Icon name="info" size={20} /> : <span className="a-dot" />}
              </span>
              <span className="a-name">{r.name}</span>
              <span className="a-desc">· {r.desc}</span>
              {s === "soon" && <span className="a-soon">준비 중</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
