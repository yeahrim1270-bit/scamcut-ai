"use client";

import { useState } from "react";
import { href } from "@/lib/route";
import type { Store } from "@/lib/store";
import { BrandBar, Empty, EvidenceRow, IncidentRow, Sheet, TabBar } from "./common";
import { Icon, type IconName } from "./icons";
import IncidentSheet from "./IncidentSheet";
import { ScaniAvatar, ScaniGuideSheet, ScaniMessage } from "./Scani";
import { isActiveJob } from "@/lib/models";
import { deriveStage, scaniLine } from "@/lib/scani";

const FEATURES: { name: string; desc: string; icon: IconName }[] = [
  { name: "MULTI SCAN", desc: "문자·전화·이메일\n위험 징후 분석", icon: "search" },
  { name: "SCAM FLOW", desc: "여러 자료를 연결해\n사건 흐름 분석", icon: "network" },
  { name: "ACTION GUARD", desc: "송금·인증번호 등\n위험 행동 탐지", icon: "shield-check" },
  { name: "SAFE VERIFY", desc: "공식 경로 확인 및\n안전 대응 안내", icon: "bank" },
];

export default function HomeScreen({ store, go }: { store: Store; go: (to: string) => void }) {
  const { db } = store;
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [bell, setBell] = useState(false);
  const [guide, setGuide] = useState(false);
  // 스캔이 단계는 저장된 분석 기록(verdict)에서만 결정됩니다. 분석이 연결되기 전에는 항상 'idle'.
  // '분석 중' 문구는 서버에서 실제로 대기·진행 중인 분석 요청이 있을 때만 나타납니다.
  const analyzing = db.jobs.some(isActiveJob);
  const stage = deriveStage(db.analyses, analyzing);
  const line = scaniLine(stage, db.incidents.length, db.evidence.length);
  const unassigned = db.evidence.filter((e) => !e.incidentId);
  const recent = [...db.incidents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  const itemsOf = (id: string) => db.evidence.filter((e) => e.incidentId === id);

  return (
    <>
      <BrandBar onBell={() => setBell(true)} />

      <section className="hero-block">
        <div className="hero-text">
          <h2>사기의 흐름을 읽고,<br />피해의 연결을 끊다.</h2>
          <p>흩어진 문자, 전화, 이메일까지<br />하나의 사건으로 연결해<br />금융사기를 사전에 막아줍니다.</p>
        </div>
        <button className="start-btn" onClick={() => setPicking(true)}>
          <Icon name="plus" size={20} stroke={2.2} />
          <span>AI 사기 분석 시작</span>
          <Icon name="chevron-right" size={20} />
        </button>
        <button className="scani-btn" onClick={() => setGuide(true)} aria-label="스캔이 AI 도우미 열기">
          <ScaniAvatar size={156} alt="스캔이 캐릭터" />
        </button>
      </section>

      <main className="page">
        <ScaniMessage stage={stage} line={line} onClick={() => setGuide(true)} />

        <div className="feat-grid">
          {FEATURES.map((f) => (
            <button key={f.name} className="feat" onClick={() => setPicking(true)}>
              <span className="feat-ic"><Icon name={f.icon} size={22} /></span>
              <span>
                <b>{f.name}</b>
                <small>{f.desc}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="section">
          <h3>최근 사건</h3>
          {db.incidents.length > 0 && <a className="link" href={href.incidents}>전체 보기 ›</a>}
        </div>
        {recent.length === 0 ? (
          <Empty icon="folder" title="아직 사건이 없습니다" desc="사건을 만들고 관련 자료를 모아 보세요.">
            <button className="btn primary" onClick={() => setCreating(true)}>첫 사건 만들기</button>
          </Empty>
        ) : (
          <div className="stack">
            {recent.map((i) => <IncidentRow key={i.id} incident={i} items={itemsOf(i.id)} />)}
          </div>
        )}

        {unassigned.length > 0 && (
          <>
            <div className="section">
              <h3>미분류 자료 ({unassigned.length})</h3>
            </div>
            <div className="stack">
              {unassigned.slice(0, 5).map((e) => <EvidenceRow key={e.id} e={e} showDate />)}
            </div>
            {unassigned.length > 5 && <p className="muted small">외 {unassigned.length - 5}건 — 사건에 연결하면 정리됩니다.</p>}
          </>
        )}
      </main>

      {picking && (
        <Sheet title="분석할 사건 선택" onClose={() => setPicking(false)}>
          {db.incidents.length === 0 ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>분석할 사건이 없습니다. 먼저 사건을 만들고 자료를 등록해 주세요.</p>
              <button className="btn primary block" onClick={() => { setPicking(false); setCreating(true); }}>새 사건 만들기</button>
            </>
          ) : (
            <div className="stack">
              {[...db.incidents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((i) => (
                <button key={i.id} className="pick" onClick={() => go(href.analysis(i.id))}>
                  <span><b>{i.title}</b><div className="small muted">자료 {itemsOf(i.id).length}개</div></span>
                  <Icon name="chevron-right" size={18} />
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}
      {creating && (
        <IncidentSheet onSave={(t, m) => go(href.incident(store.addIncident(t, m)))} onClose={() => setCreating(false)} />
      )}
      {guide && <ScaniGuideSheet stage={stage} line={line} go={go} onClose={() => setGuide(false)} />}
      {bell && (
        <Sheet title="알림" onClose={() => setBell(false)}>
          <Empty icon="bell" title="새로운 알림이 없습니다" desc="알림 기능은 아직 제공되지 않습니다." />
        </Sheet>
      )}
      <TabBar active="home" />
    </>
  );
}
