"use client";

// 서버(FastAPI + SQLite) 기반 저장소.
//  - 화면은 즉시 반영(낙관적 업데이트)하고, 서버 저장은 요청 순서를 지키며 한 줄로 처리합니다.
//    (사건이 만들어지기 전에 그 사건의 자료가 먼저 전송되는 일이 없도록)
//  - 저장에 실패하면 오류를 알리고 서버 기준으로 다시 불러와 화면을 바로잡습니다.
//  - 서버에 연결할 수 없으면 연결 오류 화면으로 전환합니다.
//  - 이 기기(localStorage)에 있던 이전 자료는 시작할 때 서버로 옮기고, 원본은 백업으로 보관합니다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type Health, type ImportResult, type User } from "./api";
import { clearLegacyOriginals, clearLocalBackups, downloadFile, readLegacy, saveLocalBackup, stamp } from "./backup";
import {
  isActiveJob,
  jobToRecord,
  uid,
  type AnalysisJob,
  type AnalysisRecord,
  type AnalyzerInfo,
  type DB,
  type Evidence,
  type Incident,
} from "./models";
import type { Channel } from "./types";

export type StoreStatus = "loading" | "ready" | "error";
export interface Notice {
  id: number;
  kind: "error" | "info";
  text: string;
}
export interface EvidenceInput {
  incidentId: string | null;
  channel: Channel;
  sender: string;
  occurredAt: string;
  content: string;
}

interface Core {
  incidents: Incident[];
  evidence: Evidence[];
  jobs: AnalysisJob[];
}
const EMPTY_CORE: Core = { incidents: [], evidence: [], jobs: [] };

export type AuthResult = { ok: true } | { ok: false; error: string; fields: { field: string; message: string }[] };
const authFail = (e: unknown): AuthResult =>
  e instanceof ApiError ? { ok: false, error: e.message, fields: e.fields } : { ok: false, error: "알 수 없는 오류가 발생했습니다.", fields: [] };

const msgOf = (e: unknown) => (e instanceof ApiError ? e.message : "알 수 없는 오류가 발생했습니다.");
const upsertJob = (jobs: AnalysisJob[], job: AnalysisJob) =>
  [job, ...jobs.filter((j) => j.id !== job.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export function useStore() {
  const [core, setCore] = useState<Core>(EMPTY_CORE);
  const [status, setStatus] = useState<StoreStatus>("loading");
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState(0); // 저장 중인 요청 수
  const [health, setHealth] = useState<Health | null>(null);
  const [capabilities, setCapabilities] = useState<AnalyzerInfo[]>([]);
  const [user, setUser] = useState<User | null>(null); // 로그인한 회원(없으면 null)

  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const inflight = useRef(0);
  const dirty = useRef(false);
  const alive = useRef(true);
  const booted = useRef(false);
  const polling = useRef(new Set<string>());
  const seq = useRef(0);

  const say = useCallback((kind: Notice["kind"], text: string) => setNotice({ id: ++seq.current, kind, text }), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  // ---------------------------------------------------------- 분석 요청 진행 상태 추적
  const track = useCallback(
    (jobId: string) => {
      if (polling.current.has(jobId)) return;
      polling.current.add(jobId);
      (async () => {
        let failures = 0;
        while (alive.current) {
          await new Promise((r) => setTimeout(r, 700));
          if (!alive.current) break;
          try {
            const job = await api.getJob(jobId);
            failures = 0;
            setCore((c) => ({ ...c, jobs: upsertJob(c.jobs, job) }));
            if (!isActiveJob(job)) break;
          } catch (e) {
            if (e instanceof ApiError && e.status === 404) break; // 사건 삭제 등으로 사라진 요청
            if (++failures >= 5) {
              say("error", "분석 진행 상태를 확인하지 못했어요. 서버 연결을 확인해 주세요.");
              break;
            }
          }
        }
        polling.current.delete(jobId);
      })();
    },
    [say],
  );

  // ---------------------------------------------------------- 서버 상태 불러오기
  const loadState = useCallback(async () => {
    const [s, h, caps, me] = await Promise.all([api.state(), api.health().catch(() => null), api.capabilities().catch(() => []), api.me().catch(() => null)]);
    if (!alive.current) return;
    setCore({ incidents: s.incidents, evidence: s.evidence, jobs: s.jobs });
    setHealth(h);
    setCapabilities(caps);
    setUser(me);
    s.jobs.filter(isActiveJob).forEach((j) => track(j.id));
  }, [track]);

  // ---------------------------------------------------------- 시작: (이전 자료 마이그레이션) → 불러오기
  const boot = useCallback(async () => {
    setStatus("loading");
    setFatal(null);
    try {
      const legacy = readLegacy();
      let migrated: ImportResult | null = null;
      if (legacy) {
        const n = legacy.payload.incidents.length + legacy.payload.evidence.length;
        if (n > 0 || legacy.corrupt) saveLocalBackup(legacy.raw); // 1) 서버로 보내기 전에 원본부터 백업
        if (n > 0) {
          migrated = await api.importData(legacy.payload); // 2) 서버 저장
          clearLegacyOriginals(); // 3) 서버 저장이 성공한 뒤에만 원본 제거 (백업 사본은 유지)
        } else if (!legacy.corrupt) {
          clearLegacyOriginals();
        }
      }
      await loadState();
      setStatus("ready");
      if (migrated && migrated.incidents_added + migrated.evidence_added > 0) {
        const bad = migrated.errors.length ? ` (형식 오류 ${migrated.errors.length}건은 백업에만 남았어요)` : "";
        say("info", `이 기기에 있던 사건 ${migrated.incidents_added}건·자료 ${migrated.evidence_added}건을 서버로 옮겼어요. 원본은 백업으로 보관돼요.${bad}`);
      }
      if (legacy?.corrupt) say("error", "이 기기의 이전 자료를 읽지 못했어요. 원본은 지우지 않았고, 백업 사본은 ‘내 정보’에서 내려받을 수 있어요.");
    } catch (e) {
      setFatal(msgOf(e));
      setStatus("error");
    }
  }, [loadState, say]);

  useEffect(() => {
    alive.current = true;
    if (!booted.current) {
      booted.current = true;
      void boot();
    }
    return () => {
      alive.current = false;
    };
  }, [boot]);

  // ---------------------------------------------------------- 서버 저장 큐
  const enqueue = useCallback(
    <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      inflight.current++;
      setPending(inflight.current);
      const run = chain.current.then(fn).catch((e: unknown) => {
        if (e instanceof ApiError && e.unreachable) {
          setFatal(`${e.message} 마지막 변경은 저장되지 않았을 수 있어요.`);
          setStatus("error");
        } else {
          dirty.current = true;
          say("error", msgOf(e));
        }
        return undefined;
      });
      chain.current = run.then(async () => {
        inflight.current--;
        setPending(inflight.current);
        if (inflight.current === 0 && dirty.current) {
          dirty.current = false;
          try {
            await loadState(); // 실패한 변경을 되돌리고 서버 기준으로 맞춤
          } catch {
            /* 연결 문제는 다음 요청에서 다시 안내 */
          }
        }
      });
      return run as Promise<T | undefined>;
    },
    [say, loadState],
  );

  const api_ = useMemo(() => {
    const iso = () => new Date().toISOString();
    return {
      addIncident(title: string, memo: string): string {
        const id = uid();
        const t = iso();
        setCore((c) => ({ ...c, incidents: [{ id, title, memo, createdAt: t, updatedAt: t }, ...c.incidents] }));
        void enqueue(async () => {
          const s = await api.createIncident({ id, title, memo });
          setCore((c) => ({ ...c, incidents: c.incidents.map((i) => (i.id === id ? s : i)) }));
        });
        return id;
      },
      updateIncident(id: string, title: string, memo: string) {
        setCore((c) => ({ ...c, incidents: c.incidents.map((i) => (i.id === id ? { ...i, title, memo, updatedAt: iso() } : i)) }));
        void enqueue(async () => {
          const s = await api.updateIncident(id, { title, memo });
          setCore((c) => ({ ...c, incidents: c.incidents.map((i) => (i.id === id ? s : i)) }));
        });
      },
      // withEvidence=false 이면 자료는 '미분류'로 남깁니다.
      deleteIncident(id: string, withEvidence: boolean) {
        setCore((c) => ({
          incidents: c.incidents.filter((i) => i.id !== id),
          evidence: withEvidence
            ? c.evidence.filter((e) => e.incidentId !== id)
            : c.evidence.map((e) => (e.incidentId === id ? { ...e, incidentId: null } : e)),
          jobs: c.jobs.filter((j) => j.incidentId !== id),
        }));
        void enqueue(() => api.deleteIncident(id, withEvidence));
      },
      addEvidence(input: EvidenceInput): string {
        const id = uid();
        const t = iso();
        setCore((c) => ({ ...c, evidence: [{ ...input, id, createdAt: t, updatedAt: t }, ...c.evidence] }));
        void enqueue(async () => {
          const s = await api.createEvidence(id, input);
          setCore((c) => ({ ...c, evidence: c.evidence.map((e) => (e.id === id ? s : e)) }));
        });
        return id;
      },
      updateEvidence(id: string, input: EvidenceInput) {
        setCore((c) => ({ ...c, evidence: c.evidence.map((e) => (e.id === id ? { ...e, ...input, updatedAt: iso() } : e)) }));
        void enqueue(async () => {
          const s = await api.updateEvidence(id, input);
          setCore((c) => ({ ...c, evidence: c.evidence.map((e) => (e.id === id ? s : e)) }));
        });
      },
      deleteEvidence(id: string) {
        setCore((c) => ({ ...c, evidence: c.evidence.filter((e) => e.id !== id) }));
        void enqueue(() => api.deleteEvidence(id));
      },
      clearAll() {
        setCore(EMPTY_CORE);
        void enqueue(async () => {
          await api.clearAll();
          clearLegacyOriginals();
          clearLocalBackups();
        });
      },

      // 분석 요청 접수 → 대기(pending) 작업이 생기고, 진행 상태는 자동으로 추적됩니다.
      async requestAnalysis(incidentId: string): Promise<AnalysisJob | undefined> {
        return enqueue(async () => {
          const job = await api.requestAnalysis(incidentId);
          setCore((c) => ({ ...c, jobs: upsertJob(c.jobs, job) }));
          track(job.id);
          return job;
        });
      },

      // ---- 계정: 저장 큐와 별개로 즉시 처리하고, 실패 이유(서버 메시지)를 그대로 돌려줍니다.
      async signup(email: string, name: string, password: string): Promise<AuthResult> {
        try {
          setUser(await api.signup({ email, name, password }));
          return { ok: true };
        } catch (e) {
          return authFail(e);
        }
      },
      async login(email: string, password: string): Promise<AuthResult> {
        try {
          setUser(await api.login({ email, password }));
          return { ok: true };
        } catch (e) {
          return authFail(e);
        }
      },
      async logout(): Promise<boolean> {
        try {
          await api.logout();
          setUser(null);
          return true;
        } catch {
          return false;
        }
      },

      async refresh() {
        await enqueue(loadState);
      },
      retry: boot,

      // ---- 백업 / 복원
      async exportBackup(): Promise<void> {
        const data = await api.exportData();
        downloadFile(`scamcut-backup-${stamp()}.json`, JSON.stringify(data, null, 2));
      },
      async restoreBackup(text: string): Promise<ImportResult | undefined> {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error("백업 파일을 읽을 수 없어요. 이 앱에서 내려받은 JSON 파일인지 확인해 주세요.");
        }
        if (!parsed || typeof parsed !== "object") throw new Error("백업 파일 형식이 올바르지 않아요.");
        const p = parsed as { incidents?: unknown; evidence?: unknown };
        const payload = {
          incidents: Array.isArray(p.incidents) ? p.incidents : [],
          evidence: Array.isArray(p.evidence) ? p.evidence : [],
        };
        if (!payload.incidents.length && !payload.evidence.length) throw new Error("백업 파일에 가져올 사건이나 자료가 없어요.");
        const r = await enqueue(() => api.importData(payload));
        if (r) await enqueue(loadState);
        return r;
      },
    };
  }, [enqueue, loadState, track, boot]);

  return useMemo(() => {
    const analyses = core.jobs.map(jobToRecord).filter((r): r is AnalysisRecord => r !== null);
    const db: DB = { incidents: core.incidents, evidence: core.evidence, jobs: core.jobs, analyses };
    return {
      db,
      status,
      ready: status === "ready",
      fatal,
      notice,
      saving: pending > 0,
      health,
      capabilities,
      user,
      dismissNotice,
      notify: say,
      ...api_,
    };
  }, [core, status, fatal, notice, pending, health, capabilities, user, dismissNotice, say, api_]);
}

export type Store = ReturnType<typeof useStore>;
