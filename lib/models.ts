// 앱 데이터 모델 (localStorage 저장용)
import type { Channel } from "./types";

export interface Incident {
  id: string;
  title: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  id: string;
  incidentId: string | null; // null = 미분류
  channel: Channel;
  sender: string;
  occurredAt: string; // datetime-local 문자열, 비어 있을 수 있음
  content: string;
  createdAt: string;
  updatedAt: string;
}

// 사건 분석 결과의 4개 영역. 값이 있는 영역만 화면에 표시됩니다.
export interface AnalysisSections {
  multiScan?: string;
  scamFlow?: string;
  actionGuard?: string;
  safeVerify?: string;
}

// 다음 단계(AI 분석 연결)에서 채워질 기록. 현재는 항상 비어 있습니다.
export interface AnalysisRecord {
  id: string;
  incidentId: string;
  createdAt: string;
  kind: "ai" | "rule";
  title: string;
  summary: string;
  sections?: AnalysisSections;
  // 분석 단계가 판정한 결과. 값이 있을 때만 스캔이가 '위험·주의·안전' 문구로 바뀝니다.
  verdict?: "danger" | "caution" | "safe";
}

// ---- 서버의 분석 요청(작업) ----
export type JobStatus = "pending" | "running" | "succeeded" | "failed";
export type AnalyzerKey = "multi_scan" | "scam_flow" | "action_guard" | "safe_verify";

export interface AnalysisStep {
  key: AnalyzerKey;
  status: JobStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  summary?: string | null;
  detail?: string | null;
  verdict?: "danger" | "caution" | "safe" | null;
  data?: unknown; // 분석기가 만든 구조화 결과 (lib/analysis.ts 의 타입으로 해석)
}

export interface JobResult {
  title: string;
  summary: string;
  kind: "ai" | "rule";
  verdict: "danger" | "caution" | "safe" | null;
  sections: Partial<Record<AnalyzerKey, string | null>>;
}

export interface AnalysisJob {
  id: string;
  incidentId: string;
  status: JobStatus;
  analyzers: AnalyzerKey[];
  steps: AnalysisStep[];
  result: JobResult | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export const isActiveJob = (j: AnalysisJob) => j.status === "pending" || j.status === "running";

export interface AnalyzerInfo {
  key: AnalyzerKey;
  title: string;
  description: string;
  engine: "ai" | "rule";
  implemented: boolean;
  ready: boolean; // 지금 실행 가능한지 (AI 모델 파일 준비 등)
  note: string | null;
}

export interface DB {
  incidents: Incident[];
  evidence: Evidence[];
  jobs: AnalysisJob[]; // 서버의 분석 요청 기록 (대기·진행·성공·실패)
  analyses: AnalysisRecord[]; // 성공한 분석 요청에서 만든 결과 기록 (화면 표시용)
}

export const EMPTY_DB: DB = { incidents: [], evidence: [], jobs: [], analyses: [] };

// 성공한 분석 요청 → 화면에서 쓰는 결과 기록
export function jobToRecord(job: AnalysisJob): AnalysisRecord | null {
  if (job.status !== "succeeded" || !job.result) return null;
  const s = job.result.sections;
  return {
    id: job.id,
    incidentId: job.incidentId,
    createdAt: job.finishedAt ?? job.createdAt,
    kind: job.result.kind,
    title: job.result.title,
    summary: job.result.summary,
    verdict: job.result.verdict ?? undefined,
    sections: {
      multiScan: s.multi_scan ?? undefined,
      scamFlow: s.scam_flow ?? undefined,
      actionGuard: s.action_guard ?? undefined,
      safeVerify: s.safe_verify ?? undefined,
    },
  };
}

export function uid(): string {
  // crypto.randomUUID는 http(LAN) 접속에서 쓸 수 없어 직접 생성
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function timeValue(e: Evidence): number {
  const t = Date.parse(e.occurredAt);
  return isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

// 시각 오름차순, 시각 미입력 자료는 맨 뒤(등록 순)
export function sortChrono(list: Evidence[]): Evidence[] {
  return [...list].sort((a, b) => {
    const ta = timeValue(a);
    const tb = timeValue(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}
