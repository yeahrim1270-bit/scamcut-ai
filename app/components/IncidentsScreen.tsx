"use client";

import { useState } from "react";
import { href } from "@/lib/route";
import type { Store } from "@/lib/store";
import { Empty, IncidentRow, Notice, TabBar, TopBar } from "./common";
import { Icon } from "./icons";
import IncidentSheet from "./IncidentSheet";

export default function IncidentsScreen({ store, go }: { store: Store; go: (to: string) => void }) {
  const { db } = store;
  const [creating, setCreating] = useState(false);
  const list = [...db.incidents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const unassigned = db.evidence.filter((e) => !e.incidentId).length;

  return (
    <>
      <TopBar
        title="사건 목록"
        right={
          <button className="icon-btn plain" onClick={() => setCreating(true)} aria-label="새 사건">
            <Icon name="plus" size={24} stroke={2.2} />
          </button>
        }
      />
      <main className="page">
        {list.length === 0 ? (
          <Empty icon="folder" title="등록된 사건이 없습니다" desc="하나의 사기 의심 건에 해당하는 자료를 사건으로 묶어 관리하세요.">
            <button className="btn primary" onClick={() => setCreating(true)}>새 사건 만들기</button>
          </Empty>
        ) : (
          <div className="stack">
            {list.map((i) => <IncidentRow key={i.id} incident={i} items={db.evidence.filter((e) => e.incidentId === i.id)} />)}
          </div>
        )}
        {unassigned > 0 && (
          <div style={{ marginTop: 14 }}>
            <Notice>미분류 자료 {unassigned}건이 있습니다. 홈 화면에서 확인하고, 자료를 수정해 사건에 연결하세요.</Notice>
          </div>
        )}
      </main>
      {creating && (
        <IncidentSheet onSave={(t, m) => go(href.incident(store.addIncident(t, m)))} onClose={() => setCreating(false)} />
      )}
      <TabBar active="incidents" />
    </>
  );
}
