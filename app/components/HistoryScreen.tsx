"use client";

import { href } from "@/lib/route";
import type { Store } from "@/lib/store";
import type { JobStatus } from "@/lib/models";
import { Empty, IncidentRow, Notice, TabBar, TopBar, fmtDateTime } from "./common";
import { Icon } from "./icons";

const JOB_LABEL: Record<JobStatus, { text: string; cls: string }> = {
  pending: { text: "대기 중", cls: "" },
  running: { text: "분석 중", cls: "running" },
  succeeded: { text: "성공", cls: "done" },
  failed: { text: "실패", cls: "failed" },
};

// 분석 내역: 저장된 분석 기록만 표시합니다. 다음 단계에서 AI 분석이 연결되면 여기에 쌓입니다.
export default function HistoryScreen({ store }: { store: Store }) {
  const { db } = store;
  const records = [...db.analyses].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const titleOf = (id: string) => db.incidents.find((i) => i.id === id)?.title ?? "삭제된 사건";

  return (
    <>
      <TopBar title="분석 내역" />
      <main className="page">
        {records.length === 0 ? (
          <Empty icon="file-text" title="아직 분석 내역이 없습니다" desc="AI 분석은 다음 단계에서 연결됩니다. 연결되면 사건별 분석 결과가 이곳에 기록됩니다." />
        ) : (
          <div className="stack">
            {records.map((r) => (
              <a key={r.id} className="row-card" href={href.analysis(r.incidentId)}>
                <span className="tile"><Icon name="file-text" size={22} /></span>
                <div className="grow">
                  <div className="inc-title">{r.title}</div>
                  <div className="inc-sub">
                    {titleOf(r.incidentId)} <i>|</i> {r.kind === "ai" ? "AI 분석" : "규칙 기반"} <i>|</i> {fmtDateTime(r.createdAt)}
                  </div>
                  <div className="rec-sum">{r.summary}</div>
                </div>
                <span className="chev"><Icon name="chevron-right" size={18} /></span>
              </a>
            ))}
          </div>
        )}

        {db.jobs.length > 0 && (
          <>
            <div className="section"><h3>분석 요청 기록</h3></div>
            <div className="stack">
              {db.jobs.map((j) => {
                const l = JOB_LABEL[j.status];
                return (
                  <a key={j.id} className="row-card" href={href.analysis(j.incidentId)}>
                    <span className="tile"><Icon name="clock" size={22} /></span>
                    <div className="grow">
                      <div className="inc-title">{titleOf(j.incidentId)}</div>
                      <div className="inc-sub">{fmtDateTime(j.createdAt)}</div>
                      {j.status === "failed" && j.errorMessage && <div className="rec-sum">{j.errorMessage}</div>}
                    </div>
                    <span className={`badge-state ${l.cls}`}>{l.text}</span>
                  </a>
                );
              })}
            </div>
          </>
        )}

        <div className="section"><h3>분석 준비 현황</h3></div>
        {db.incidents.length === 0 ? (
          <Notice>사건을 만들고 자료를 등록하면 분석 대상이 여기에 표시됩니다.</Notice>
        ) : (
          <div className="stack">
            {db.incidents.map((i) => (
              <a key={i.id} className="row-card" href={href.analysis(i.id)}>
                <span className="tile"><Icon name="folder" size={22} /></span>
                <div className="grow">
                  <div className="inc-title">{i.title}</div>
                  <div className="inc-sub">자료 {db.evidence.filter((e) => e.incidentId === i.id).length}개 <i>|</i> 분석 화면 보기</div>
                </div>
                <span className="chev"><Icon name="chevron-right" size={18} /></span>
              </a>
            ))}
          </div>
        )}
      </main>
      <TabBar active="history" />
    </>
  );
}
