// FastAPI 백엔드 클라이언트. 모든 요청은 같은 출처의 /backend/* 를 거칩니다(next.config.mjs 의 rewrites).
import type { AnalysisJob, AnalysisStep, AnalyzerInfo, AnalyzerKey, Evidence, Incident, JobResult, JobStatus } from "./models";
import type { Channel } from "./types";

const BASE = "/backend";
const UNREACHABLE = "서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인해 주세요.";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: { field: string; message: string }[] = [],
  ) {
    super(message);
  }
  get unreachable() {
    return this.code === "NETWORK" || this.code === "SERVER_UNREACHABLE";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", UNREACHABLE);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      /* JSON 이 아닌 응답 */
    }
  }
  if (!res.ok) {
    const e = (data as { error?: { code: string; message: string; fields?: { field: string; message: string }[] } } | null)?.error;
    if (e) throw new ApiError(res.status, e.code, e.message, e.fields ?? []);
    // 백엔드가 꺼져 있으면 Next.js 프록시가 JSON 이 아닌 5xx 를 돌려줍니다.
    if (res.status >= 500) throw new ApiError(res.status, "SERVER_UNREACHABLE", UNREACHABLE);
    throw new ApiError(res.status, "HTTP_ERROR", `요청에 실패했습니다 (${res.status}).`);
  }
  return data as T;
}

// ---------------------------------------------------------------- 서버(snake_case) → 앱(camelCase)
interface RawIncident { id: string; title: string; memo: string; created_at: string; updated_at: string; evidence_count: number }
interface RawEvidence { id: string; incident_id: string | null; channel: Channel; sender: string; occurred_at: string; content: string; created_at: string; updated_at: string }
interface RawStep { key: AnalyzerKey; status: JobStatus; error_code?: string | null; error_message?: string | null; summary?: string | null; detail?: string | null; verdict?: "danger" | "caution" | "safe" | null; data?: unknown }
interface RawJob {
  id: string; incident_id: string; status: JobStatus; analyzers: AnalyzerKey[]; steps: RawStep[];
  result: { title: string; summary: string; kind: "ai" | "rule"; verdict: "danger" | "caution" | "safe" | null; sections: JobResult["sections"] } | null;
  error_code: string | null; error_message: string | null; created_at: string; started_at: string | null; finished_at: string | null;
}

const mapIncident = (r: RawIncident): Incident => ({ id: r.id, title: r.title, memo: r.memo, createdAt: r.created_at, updatedAt: r.updated_at });
const mapEvidence = (r: RawEvidence): Evidence => ({
  id: r.id, incidentId: r.incident_id, channel: r.channel, sender: r.sender, occurredAt: r.occurred_at,
  content: r.content, createdAt: r.created_at, updatedAt: r.updated_at,
});
const mapStep = (s: RawStep): AnalysisStep => ({
  key: s.key, status: s.status, errorCode: s.error_code, errorMessage: s.error_message, summary: s.summary, detail: s.detail, verdict: s.verdict, data: s.data,
});
export const mapJob = (j: RawJob): AnalysisJob => ({
  id: j.id, incidentId: j.incident_id, status: j.status, analyzers: j.analyzers, steps: j.steps.map(mapStep),
  result: j.result, errorCode: j.error_code, errorMessage: j.error_message,
  createdAt: j.created_at, startedAt: j.started_at, finishedAt: j.finished_at,
});

export interface EvidencePayload {
  incidentId: string | null;
  channel: Channel;
  sender: string;
  occurredAt: string;
  content: string;
}
const evBody = (b: EvidencePayload) => ({
  incident_id: b.incidentId, channel: b.channel, sender: b.sender, occurred_at: b.occurredAt, content: b.content,
});

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}
interface RawUser { id: string; email: string; name: string; created_at: string }
const mapUser = (u: RawUser): User => ({ id: u.id, email: u.email, name: u.name, createdAt: u.created_at });

export interface Health {
  status: string; version: string; database: string; analyzers_implemented: number; analyzers_total: number;
}
export interface ImportResult {
  incidents_added: number; incidents_skipped: number; evidence_added: number; evidence_skipped: number;
  evidence_unlinked: number; errors: string[];
}

const enc = encodeURIComponent;

export const api = {
  // 계정 (로그인 상태는 서버가 httpOnly 쿠키로 유지)
  me: () => request<{ user: RawUser | null }>("GET", "/api/auth/me").then((r) => (r.user ? mapUser(r.user) : null)),
  signup: (b: { email: string; name: string; password: string }) => request<RawUser>("POST", "/api/auth/signup", b).then(mapUser),
  login: (b: { email: string; password: string }) => request<RawUser>("POST", "/api/auth/login", b).then(mapUser),
  logout: () => request<unknown>("POST", "/api/auth/logout", {}),

  health: () => request<Health>("GET", "/api/health"),
  capabilities: () => request<AnalyzerInfo[]>("GET", "/api/analysis/capabilities"),
  async state() {
    const s = await request<{ incidents: RawIncident[]; evidence: RawEvidence[]; analysis_jobs: RawJob[] }>("GET", "/api/state");
    return { incidents: s.incidents.map(mapIncident), evidence: s.evidence.map(mapEvidence), jobs: s.analysis_jobs.map(mapJob) };
  },

  createIncident: (b: { id: string; title: string; memo: string }) => request<RawIncident>("POST", "/api/incidents", b).then(mapIncident),
  updateIncident: (id: string, b: { title: string; memo: string }) => request<RawIncident>("PATCH", `/api/incidents/${enc(id)}`, b).then(mapIncident),
  deleteIncident: (id: string, withEvidence: boolean) => request<unknown>("DELETE", `/api/incidents/${enc(id)}?delete_evidence=${withEvidence}`),

  createEvidence: (id: string, b: EvidencePayload) => request<RawEvidence>("POST", "/api/evidence", { id, ...evBody(b) }).then(mapEvidence),
  updateEvidence: (id: string, b: EvidencePayload) => request<RawEvidence>("PATCH", `/api/evidence/${enc(id)}`, evBody(b)).then(mapEvidence),
  deleteEvidence: (id: string) => request<unknown>("DELETE", `/api/evidence/${enc(id)}`),

  requestAnalysis: (incidentId: string) => request<RawJob>("POST", `/api/incidents/${enc(incidentId)}/analyses`, {}).then(mapJob),
  getJob: (id: string) => request<RawJob>("GET", `/api/analyses/${enc(id)}`).then(mapJob),

  exportData: () => request<unknown>("GET", "/api/export"),
  importData: (payload: { incidents: unknown[]; evidence: unknown[] }) => request<ImportResult>("POST", "/api/import", payload),
  clearAll: () => request<unknown>("DELETE", "/api/data?confirm=true"),
};
