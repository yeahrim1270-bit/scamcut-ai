"use client";

// 해시 기반 라우터: 새로고침·뒤로가기가 동작하고 Vercel에서 별도 설정이 필요 없습니다.
import { useCallback, useEffect, useState } from "react";

export type Route =
  | { name: "home" }
  | { name: "incidents" }
  | { name: "incident"; id: string }
  | { name: "analysis"; incidentId: string; autorun: boolean }
  | { name: "evidence-new"; incidentId: string | null }
  | { name: "evidence-edit"; id: string }
  | { name: "evidence"; id: string }
  | { name: "history" }
  | { name: "me" }
  | { name: "login" }
  | { name: "signup" };

export function parse(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const seg = path.split("/").filter(Boolean);
  const q = new URLSearchParams(query);
  if (seg[0] === "incidents") return { name: "incidents" };
  if (seg[0] === "incident" && seg[1] && seg[2] === "analysis") return { name: "analysis", incidentId: decodeURIComponent(seg[1]), autorun: q.get("run") === "1" };
  if (seg[0] === "incident" && seg[1]) return { name: "incident", id: decodeURIComponent(seg[1]) };
  if (seg[0] === "evidence" && seg[1] === "new") return { name: "evidence-new", incidentId: q.get("incident") };
  if (seg[0] === "evidence" && seg[1] && seg[2] === "edit") return { name: "evidence-edit", id: decodeURIComponent(seg[1]) };
  if (seg[0] === "evidence" && seg[1]) return { name: "evidence", id: decodeURIComponent(seg[1]) };
  if (seg[0] === "history") return { name: "history" };
  if (seg[0] === "me") return { name: "me" };
  if (seg[0] === "login") return { name: "login" };
  if (seg[0] === "signup") return { name: "signup" };
  return { name: "home" };
}

export const href = {
  home: "#/",
  incidents: "#/incidents",
  incident: (id: string) => `#/incident/${encodeURIComponent(id)}`,
  // run=true 이면 화면이 열리자마자 분석을 시작합니다(타임라인의 'AI 분석하기')
  analysis: (incidentId: string, run = false) => `#/incident/${encodeURIComponent(incidentId)}/analysis${run ? "?run=1" : ""}`,
  evidence: (id: string) => `#/evidence/${encodeURIComponent(id)}`,
  evidenceNew: (incidentId?: string | null) => `#/evidence/new${incidentId ? `?incident=${encodeURIComponent(incidentId)}` : ""}`,
  evidenceEdit: (id: string) => `#/evidence/${encodeURIComponent(id)}/edit`,
  history: "#/history",
  me: "#/me",
  login: "#/login",
  signup: "#/signup",
};

export function useRoute() {
  const [route, setRoute] = useState<Route | null>(null);

  useEffect(() => {
    const sync = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const go = useCallback((to: string) => {
    window.location.hash = to;
  }, []);

  // 직접 진입한 경우 history.back()이 앱 밖으로 나갈 수 있어 fallback 사용
  const back = useCallback((fallback: string) => {
    if (window.history.length > 1) window.history.back();
    else window.location.hash = fallback;
  }, []);

  return { route, go, back };
}
