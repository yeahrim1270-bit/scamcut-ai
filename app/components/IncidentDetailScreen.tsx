"use client";

import { useState } from "react";
import { stepData, type MultiScanData } from "@/lib/analysis";
import { sortChrono } from "@/lib/models";
import { href } from "@/lib/route";
import type { Store } from "@/lib/store";
import { connectionReasons, oneLine } from "@/lib/timelineInfo";
import { CHANNEL_LABEL } from "@/lib/types";
import { ConfirmSheet, Empty, TabBar, TopBar, fmtDate } from "./common";
import { Icon } from "./icons";
import IncidentSheet from "./IncidentSheet";

const p2 = (n: number) => String(n).padStart(2, "0");

// 사건 타임라인: 등록된 자료를 시각 순서대로 점과 선으로 잇고, 자료마다 한 줄 요약을 보여 줍니다.
// 한 줄 요약·연결 근거는 서버의 분석 결과(실제 탐지)가 있을 때만 채워지고, 없으면 원문 앞부분을 보여 줍니다.
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
  const days = new Set(items.filter((e) => e.occurredAt).map((e) => e.occurredAt.slice(0, 10)));
  const multiDay = days.size > 1;

  // 가장 최근에 성공한 분석 결과(있을 때만)
  const job = store.db.jobs.find((j) => j.incidentId === id && j.status === "succeeded");
  const scan = stepData<MultiScanData>(job, "multi_scan");
  const scanById = new Map((scan?.evidence ?? []).map((e) => [e.evidence_id, e]));
  const reasons = connectionReasons(scan);
  const last = store.db.analyses.filter((a) => a.incidentId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const title = (e: (typeof items)[number]) => {
    const d = e.occurredAt ? new Date(e.occurredAt) : null;
    if (!d || isNaN(d.getTime())) return `시각 미입력 ${CHANNEL_LABEL[e.channel]}`;
    const day = multiDay ? `${p2(d.getMonth() + 1)}.${p2(d.getDate())} ` : "";
    return `${day}${p2(d.getHours())}:${p2(d.getMinutes())} ${CHANNEL_LABEL[e.channel]}`;
  };

  return (
    <>
      <TopBar title="사건 타임라인" onBack={() => back(href.incidents)} />
      <main className="page has-cta">
        <div className="flow-head">
          <div className="grow">
            <div className="t">{incident.title}</div>
            <div className="s">관련 자료 {items.length}건 · {fmtDate(incident.createdAt)} 생성</div>
          </div>
          <button className="icon-btn plain" onClick={() => setEditing(true)} aria-label="사건 수정">
            <Icon name="pencil" size={19} />
          </button>
        </div>
        {incident.memo && <p className="memo">{incident.memo}</p>}

        {/* 최근 분석에서 위험·주의 판정이 있으면 경고 표시 (서버가 저장한 분석 결과 기준) */}
        {last && (last.verdict === "danger" || last.verdict === "caution") && (
          <div className={`inc-alert ${last.verdict}`} role="alert">
            <Icon name="shield" size={18} />
            <span>{last.verdict === "danger" ? "최근 분석에서 위험 징후가 발견됐어요" : "최근 분석에서 주의가 필요한 표현이 있어요"}</span>
            <a href={href.analysis(id)}>결과 보기</a>
          </div>
        )}

        {items.length === 0 ? (
          <div style={{ marginTop: 16 }}>
            <Empty icon="clock" title="이 사건에 연결된 자료가 없습니다" desc="문자·전화·이메일 자료를 추가하면 시간 순서대로 표시됩니다.">
              <a className="btn primary" href={href.evidenceNew(id)}>자료 등록하기</a>
            </Empty>
          </div>
        ) : (
          <>
            <div className="list-head">
              <span>시간 순서</span>
              <a className="link" href={href.evidenceNew(id)}>+ 자료 추가</a>
            </div>
            <ol className="flow">
              {items.map((e) => (
                <li key={e.id} className={`flow-item ${e.occurredAt && !isNaN(Date.parse(e.occurredAt)) ? "" : "undated"}`}>
                  <a className="flow-card" href={href.evidence(e.id)}>
                    <b>{title(e)}</b>
                    <p>{oneLine(e, scanById.get(e.id))}</p>
                  </a>
                </li>
              ))}
            </ol>

            {reasons.length > 0 ? (
              <div className="flow-reasons">
                <b>연결 근거</b>
                <p>{reasons.join(" + ")}</p>
                <span className="hint">분석 결과에서 자료들이 실제로 겹친 부분이에요.</span>
                <a className="link" href={href.analysis(id)}>분석 결과 보기 ›</a>
              </div>
            ) : (
              last && (
                <div className="flow-reasons">
                  <b>분석 완료</b>
                  <p>자료 사이에서 겹치는 부분은 발견되지 않았어요.</p>
                  <a className="link" href={href.analysis(id)}>분석 결과 보기 ›</a>
                </div>
              )
            )}
          </>
        )}

        <button className="text-danger" onClick={() => setDeleting(true)}>
          <Icon name="trash" size={16} /> 이 사건 삭제
        </button>
      </main>

      <div className="bottom-cta">
        <a className="btn primary block lg" href={href.analysis(id, true)}>
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
