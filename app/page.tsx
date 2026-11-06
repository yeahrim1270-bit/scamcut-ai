"use client";

import { useEffect, useState } from "react";
import { useRoute } from "@/lib/route";
import { useStore } from "@/lib/store";
import AnalysisScreen from "./components/AnalysisScreen";
import AuthScreen from "./components/AuthScreen";
import ConnectionError from "./components/ConnectionError";
import EvidenceDetailScreen from "./components/EvidenceDetailScreen";
import EvidenceFormScreen from "./components/EvidenceFormScreen";
import HistoryScreen from "./components/HistoryScreen";
import HomeScreen from "./components/HomeScreen";
import IncidentDetailScreen from "./components/IncidentDetailScreen";
import IncidentsScreen from "./components/IncidentsScreen";
import MeScreen from "./components/MeScreen";
import SplashScreen from "./components/SplashScreen";
import SyncToast from "./components/SyncToast";

const SPLASH_MS = 2000; // 시작 화면 노출 시간 (2초)

export default function Page() {
  const { route, go, back } = useRoute();
  const store = useStore();

  // 앱 실행 화면: 탭(세션)에서 처음 열 때 2초간 보여 주고, 그동안 서버에서 데이터를 불러옵니다.
  // null = 아직 판단 전(깜빡임 방지), true = 표시 중, false = 건너뜀/종료
  const [splash, setSplash] = useState<boolean | null>(null);
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("scamcut.splash") === "1";
      sessionStorage.setItem("scamcut.splash", "1");
    } catch {}
    if (seen) {
      setSplash(false);
      return;
    }
    setSplash(true);
    const t = setTimeout(() => setSplash(false), SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  if (splash === true) return <SplashScreen />;

  // 해시는 브라우저에서만 읽을 수 있어 마운트 후 렌더링, 데이터는 서버에서 불러온 뒤 표시
  if (splash === null || !route || store.status === "loading") {
    return (
      <div className="splash">
        <div>
          <span className="spinner dark" /> SCAM CUT AI
          <div className="hint" style={{ marginTop: 6, textAlign: "center" }}>서버에 연결하는 중…</div>
        </div>
      </div>
    );
  }
  if (store.status === "error") return <ConnectionError store={store} />;

  return (
    <div className="app">
      {route.name === "home" && <HomeScreen store={store} go={go} />}
      {route.name === "incidents" && <IncidentsScreen store={store} go={go} />}
      {route.name === "incident" && <IncidentDetailScreen key={route.id} id={route.id} store={store} go={go} back={back} />}
      {route.name === "analysis" && <AnalysisScreen key={route.incidentId} incidentId={route.incidentId} autorun={route.autorun} store={store} go={go} back={back} />}
      {route.name === "evidence" && <EvidenceDetailScreen key={route.id} id={route.id} store={store} go={go} back={back} />}
      {route.name === "evidence-new" && (
        <EvidenceFormScreen key={"new" + (route.incidentId ?? "")} presetIncidentId={route.incidentId} store={store} go={go} back={back} />
      )}
      {route.name === "evidence-edit" && <EvidenceFormScreen key={route.id} editId={route.id} store={store} go={go} back={back} />}
      {route.name === "history" && <HistoryScreen store={store} />}
      {route.name === "me" && <MeScreen store={store} go={go} />}
      {(route.name === "login" || route.name === "signup") && <AuthScreen mode={route.name} store={store} go={go} back={back} />}
      <SyncToast store={store} />
    </div>
  );
}
