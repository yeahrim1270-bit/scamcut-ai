"use client";

import { useRoute } from "@/lib/route";
import { useStore } from "@/lib/store";
import AnalysisScreen from "./components/AnalysisScreen";
import ConnectionError from "./components/ConnectionError";
import EvidenceDetailScreen from "./components/EvidenceDetailScreen";
import EvidenceFormScreen from "./components/EvidenceFormScreen";
import HistoryScreen from "./components/HistoryScreen";
import HomeScreen from "./components/HomeScreen";
import IncidentDetailScreen from "./components/IncidentDetailScreen";
import IncidentsScreen from "./components/IncidentsScreen";
import MeScreen from "./components/MeScreen";
import SyncToast from "./components/SyncToast";

export default function Page() {
  const { route, go, back } = useRoute();
  const store = useStore();

  // 해시는 브라우저에서만 읽을 수 있어 마운트 후 렌더링, 데이터는 서버에서 불러온 뒤 표시
  if (!route || store.status === "loading") {
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
      {route.name === "analysis" && <AnalysisScreen key={route.incidentId} incidentId={route.incidentId} store={store} go={go} back={back} />}
      {route.name === "evidence" && <EvidenceDetailScreen key={route.id} id={route.id} store={store} go={go} back={back} />}
      {route.name === "evidence-new" && (
        <EvidenceFormScreen key={"new" + (route.incidentId ?? "")} presetIncidentId={route.incidentId} store={store} go={go} back={back} />
      )}
      {route.name === "evidence-edit" && <EvidenceFormScreen key={route.id} editId={route.id} store={store} go={go} back={back} />}
      {route.name === "history" && <HistoryScreen store={store} />}
      {route.name === "me" && <MeScreen store={store} />}
      <SyncToast store={store} />
    </div>
  );
}
