"use client";

import { CHANNEL_LABEL, RISK_LABEL, levelOf, type Channel, type RiskLevel } from "@/lib/types";

export function Risk({ score, level }: { score: number; level?: RiskLevel }) {
  const lv = level ?? levelOf(score);
  return (
    <span className={`risk ${lv}`}>
      {RISK_LABEL[lv]} {score}
    </span>
  );
}

export function RiskBar({ score }: { score: number }) {
  const lv = levelOf(score);
  return (
    <div className="bar">
      <i style={{ width: `${score}%`, background: `var(--${lv})` }} />
    </div>
  );
}

export function Src({ kind }: { kind: "ai" | "rule" }) {
  return kind === "ai" ? <span className="chip ai">🤖 AI 분석</span> : <span className="chip rule">📏 규칙 기반</span>;
}

export function Ch({ channel }: { channel: Channel }) {
  const icon = channel === "sms" ? "✉️" : channel === "call" ? "📞" : "💬";
  return (
    <span className={`chip ${channel}`}>
      {icon} {CHANNEL_LABEL[channel]}
    </span>
  );
}

export function fmtTime(s: string) {
  if (!s) return "시각 미입력";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
