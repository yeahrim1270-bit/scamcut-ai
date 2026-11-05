// 백엔드 분석기가 돌려주는 구조화 결과(step.data)의 타입.
// MULTI SCAN: scamcut.multiscan.v1 / ACTION GUARD: scamcut.actionguard.v1
// STEP 5 의 SCAM FLOW 는 같은 구조(증거별 엔티티·사칭·주제·행동)를 읽어 자료 사이의 연결을 만듭니다.
import type { AnalysisJob, AnalyzerKey } from "./models";

export type Source = "model" | "rule" | "model+rule";
export type Level = "low" | "caution" | "high";

export interface SentenceRef {
  sentence_idx: number;
  text: string;
  start: number; // 자료 원문(content) 기준 위치
  end: number;
}
export interface PhraseRef {
  text: string;
  start: number;
  end: number;
}
export interface UrlInfo {
  url: string;
  domain: string;
  risk: "high" | "medium" | "low" | "unknown";
  reasons: string[];
  note: string;
  official: boolean;
  start: number;
  end: number;
}
export interface Impersonation extends SentenceRef {
  category: string;
  category_name: string;
  name: string | null;
  source: Source;
  score: number;
}
export interface TopicHit extends SentenceRef {
  topic: string;
  name: string;
  score: number;
  source: Source;
}
export interface PressureHit extends SentenceRef {
  source: Source;
  score: number;
  phrase: PhraseRef | null;
}
export interface ActionHit extends SentenceRef {
  source: Source;
  score: number | null;
}
export interface MultiScanEvidence {
  evidence_id: string;
  channel: string;
  occurred_at: string;
  entities: {
    urls: UrlInfo[];
    phones: string[];
    accounts: string[];
    amounts: number[];
    persons: string[];
    orgs: { name: string; category: string }[];
  };
  impersonation: Impersonation[];
  topics: TopicHit[];
  urgency: PressureHit[];
  threats: PressureHit[];
  secrecy: PressureHit[];
  actions: { action: string; label: string; name: string; source: Source; evidence: ActionHit[] }[];
  classification: { kind: "normal_notice" | "needs_check" | "suspicious"; label: string; benign_score: number };
  risk: { score: number; level: Level; label: string; reasons: string[] };
}
export interface ModelInfo {
  name: string;
  revision: string;
  classifier: { n_train: number | null; cv_macro_f1: number | null };
}
export interface MultiScanData {
  schema: "scamcut.multiscan.v1";
  model: ModelInfo;
  overall: { level: Level; label: string; counts: Record<Level, number> };
  caveat: string;
  evidence: MultiScanEvidence[];
}
export interface GuardAction {
  action: string;
  name: string;
  severity: "high" | "medium" | "low";
  why: string;
  safe_response: string;
  source: Source;
  evidence: {
    evidence_id: string;
    channel: string;
    occurred_at: string;
    sentence: { idx: number; text: string; start: number; end: number };
    source: Source;
    score: number | null;
  }[];
}
export interface ActionGuardData {
  schema: "scamcut.actionguard.v1";
  level: Level;
  headline: string;
  actions: GuardAction[];
  links: UrlInfo[];
  caveat: string;
}

// 가장 최근 성공한 분석 요청에서 분석기 결과 꺼내기
export function stepData<T>(job: AnalysisJob | undefined, key: AnalyzerKey): T | null {
  if (!job || job.status !== "succeeded") return null;
  const d = job.steps.find((s) => s.key === key && s.status === "succeeded")?.data;
  return (d as T) ?? null;
}
