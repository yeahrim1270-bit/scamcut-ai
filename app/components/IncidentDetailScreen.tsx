"use client";

import { useState } from "react";
import { sortChrono } from "@/lib/models";
import { href } from "@/lib/route";
import type { Store } from "@/lib/store";
import { ConfirmSheet, Empty, EvidenceRow, IncidentCard, TabBar, TopBar, fmtDate, fmtDay } from "./common";
import { Icon } from "./icons";
import IncidentSheet from "./IncidentSheet";

// 사건 타임라인: 등록된 자료를 시각 순서대로 배치합니다. (분석 결과가 아닌 단순 정렬)
export default function IncidentDetailScreen({
  id,
  store,
  go,
  back,
}: {
  id: string;
  store: Store;
  go: (to: string) => void;
  back: (fallback: string) => void;
}) {
  const incident = store.db.incidents.find((i) => i.id === id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!incident) {
    return (
      <>
        <TopBar title="사건 타임라인" onBack={() => go(href.incidents)} />
        <main className="page">
          <Empty icon="search" title="사건을 찾을 수 없습니다" desc="삭제되었거나 잘못된 주소입니다.">
            <a className="btn primary" href={href.incidents}>사건 목록으로</a>
          </Empty>
        </main>
        <TabBar active="incidents" />
      </>
    );
  }

  const items = sortChrono(store.db.evidence.filter((e) => e.incidentId === id));
  const dated = items.filter((e) => e.occurredAt && !isNaN(Date.parse(e.occurredAt)));
  const undated = items.filter((e) => !dated.includes(e));
  const dayOf = (s: string) => s.slice(0, 10);

  return (
    <>
      <TopBar title="사건 타임라인" onBack={() => back(href.incidents)} />
      <main className="page has-cta">
        <IncidentCard
          title={incident.title}
          sub={`자료 ${items.length}개 | ${fmtDate(incident.createdAt)} 생성`}
          onEdit={() => setEditing(true)}
        />
        {incident.memo && <p className="memo">{incident.memo}</p>}

        {/* 최근 분석에서 위험·주의 판정이 있으면 경고 표시 (서버가 저장한 분석 결과 기준) */}
        {(() => {
          const last = store.db.analyses.filter((a) => a.incidentId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          if (!last || (last.verdict !== "danger" && last.verdict !== "caution")) return null;
          return (
            <div className={`inc-alert ${last.verdict}`} role="alert">
              <Icon name="shield" size={18} />
              <span>{last.verdict === "danger" ? "최근 분석에서 위험 징후가 발견됐어요" : "최근 분석에서 주의가 필요한 표현이 있어요"}</span>
              <a href={href.analysis(id)}>결과 보기</a>
            </div>
          );
        })()}

        <div className="tabs2" role="tablist">
          <a className="on" role="tab" aria-selected="true" href={href.incident(id)}>타임라인</a>
          <a role="tab" aria-selected="false" href={href.analysis(id)}>분석 결과</a>
        </div>

        {items.length === 0 ? (
          <Empty icon="clock" title="이 사건에 연결된 자료가 없습니다" desc="문자·전화·이메일 자료를 추가하면 시간 순서대로 표시됩니다.">
            <a className="btn primary" href={href.evidenceNew(id)}>자료 등록하기</a>
          </Empty>
        ) : (
          <>
            <div className="list-head">
              <span>자료 {items.length}개</span>
              <a className="link" href={href.evidenceNew(id)}>+ 자료 추가</a>
            </div>
            <div className="timeline">
              {dated.map((e, idx) => {
                const showDay = idx === 0 || dayOf(dated[idx - 1].occurredAt) !== dayOf(e.occurredAt);
                return (
                  <div key={e.id}>
                    {showDay && <div className="tl-date">{fmtDay(dayOf(e.occurredAt))}</div>}
                    <div className={`tl-item dot-${e.channel}`}>
                      <EvidenceRow e={e} />
                    </div>
                  </div>
                );
              })}
              {undated.length > 0 && (
                <>
                  <div className="tl-date">시각 미입력</div>
                  {undated.map((e) => (
                    <div key={e.id} className="tl-item undated">
                      <EvidenceRow e={e} />
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}

        <button className="text-danger" onClick={() => setDeleting(true)}>
          <Icon name="trash" size={16} /> 이 사건 삭제
        </button>
      </main>

      <div className="bottom-cta">
        <a className="btn primary block lg" href={href.analysis(id)}>
          <Icon name="shield-check" size={20} /> AI 분석하기
        </a>
      </div>

      {editing && (
        <IncidentSheet
          initial={{ title: incident.title, memo: incident.memo }}
          onSave={(t, m) => store.updateIncident(id, t, m)}
          onClose={() => setEditing(false)}
        />
      )}
      {deleting && (
        <ConfirmSheet
          title="사건을 삭제할까요?"
          message={`‘${incident.title}’ 사건을 삭제합니다. 연결된 자료 ${items.length}개는 어떻게 할까요?`}
          actions={[
            { label: "사건만 삭제 (자료는 미분류로 유지)", onClick: () => { store.deleteIncident(id, false); go(href.incidents); } },
            { label: "자료까지 모두 삭제", danger: true, onClick: () => { store.deleteIncident(id, true); go(href.incidents); } },
          ]}
          onClose={() => setDeleting(false)}
        />
      )}
      <TabBar active="incidents" />
    </>
  );
}
