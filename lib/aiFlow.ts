"use client";

// OpenAI 사건 해석(app/api/ai/analyze) 클라이언트: 호출 · 결과 타입 · 결과 캐시
import { maskItems } from "./privacy";
import type { EvidenceItem, Stage } from "./types";

export interface AiFlowResult {
  risk_level: "low" | "caution" | "high";
  headline: string;
  is_linked: boolean;
  scam_type: string;
  narrative: string;
  timeline: { item: string; stage: Stage; description: string }[];
  link_reasons: string[];
  suspicious_points: { item: string; quote: string; reason: string; quote_verified: boolean }[];
  predicted_next_step: string;
  safe_actions: { priority: number; action: string; reason: string }[];
  verify_targets: { claimed_identity: string; how_to_verify: string }[];
}

export interface AiFlowRecord {
  sig: string; // 분석에 쓴 자료의 지문 — 자료가 바뀌었는지 확인용
  at: string;
  model: string;
  result: AiFlowResult;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// 전송 대상(가려진) 자료와 지문 만들기. 개인정보는 이 기기에서 먼저 가립니다.
export function prepare(items: EvidenceItem[]) {
  const { masked, report } = maskItems(items);
  return { masked, report, sig: hash(JSON.stringify(masked.map((m) => [m.id, m.channel, m.occurredAt, m.content]))) };
}

const key = (incidentId: string) => `scamcut.aiflow.${incidentId}`;
export const loadCached = (incidentId: string): AiFlowRecord | null => {
  try {
    const raw = localStorage.getItem(key(incidentId));
    return raw ? (JSON.parse(raw) as AiFlowRecord) : null;
  } catch {
    return null;
  }
};
export const saveCached = (incidentId: string, rec: AiFlowRecord) => {
  try {
    localStorage.setItem(key(incidentId), JSON.stringify(rec));
  } catch {}
};

export async function fetchAvailability(): Promise<{ available: boolean; model: string } | null> {
  try {
    const r = await fetch("/api/ai/analyze", { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function runAiFlow(masked: EvidenceItem[]): Promise<{ ok: true; model: string; result: AiFlowResult } | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: masked }),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.ok) return { ok: false, error: d?.error ?? `AI 분석에 실패했어요 (${r.status}).` };
    return { ok: true, model: d.model, result: d.result };
  } catch {
    return { ok: false, error: "네트워크 오류로 AI 분석에 실패했어요." };
  }
}
