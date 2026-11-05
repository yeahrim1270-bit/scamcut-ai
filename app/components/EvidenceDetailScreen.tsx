"use client";

import { useState } from "react";
import { href } from "@/lib/route";
import type { Store } from "@/lib/store";
import { CHANNEL_LABEL } from "@/lib/types";
import { ChannelBadge, ConfirmSheet, Empty, TabBar, TopBar, fmtDateTime } from "./common";
import { Icon } from "./icons";

// 자료 상세: 등록한 내용을 잘림 없이 전체 표시합니다.
export default function EvidenceDetailScreen({
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
  const e = store.db.evidence.find((x) => x.id === id);
  const [deleting, setDeleting] = useState(false);

  if (!e) {
    return (
      <>
        <TopBar title="자료 상세" onBack={() => go(href.home)} />
        <main className="page">
          <Empty icon="search" title="자료를 찾을 수 없습니다" desc="삭제되었거나 잘못된 주소입니다.">
            <a className="btn primary" href={href.home}>홈으로</a>
          </Empty>
        </main>
        <TabBar active="home" />
      </>
    );
  }

  const incident = e.incidentId ? store.db.incidents.find((i) => i.id === e.incidentId) : undefined;
  const fallback = incident ? href.incident(incident.id) : href.home;

  return (
    <>
      <TopBar title="자료 상세" onBack={() => back(fallback)} />
      <main className="page">
        <div className="card">
          <div className="row between">
            <ChannelBadge channel={e.channel} />
            <span className="small muted">{fmtDateTime(e.occurredAt)}</span>
          </div>
          <dl className="meta">
            <dt>발신</dt>
            <dd>{e.sender || "발신자 미상"}</dd>
            <dt>사건</dt>
            <dd>
              {incident ? (
                <a className="link inline" href={href.incident(incident.id)}>
                  <Icon name="folder" size={15} /> {incident.title}
                </a>
              ) : (
                "미분류"
              )}
            </dd>
          </dl>
          <div className="small muted" style={{ marginBottom: 6 }}>
            {e.channel === "call" ? "통화 내용 메모" : `${CHANNEL_LABEL[e.channel]} 내용`}
          </div>
          <div className="ev-body">{e.content}</div>
          <div className="small muted" style={{ marginTop: 10 }}>
            등록 {fmtDateTime(e.createdAt)}
            {e.updatedAt !== e.createdAt && <> · 수정 {fmtDateTime(e.updatedAt)}</>}
          </div>
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <a className="btn primary grow lg" href={href.evidenceEdit(e.id)}>
            <Icon name="pencil" size={18} /> 수정
          </a>
          <button className="btn danger-outline grow lg" onClick={() => setDeleting(true)}>
            <Icon name="trash" size={18} /> 삭제
          </button>
        </div>
      </main>

      {deleting && (
        <ConfirmSheet
          title="자료를 삭제할까요?"
          message="삭제한 자료는 되돌릴 수 없습니다."
          actions={[{ label: "삭제", danger: true, onClick: () => { store.deleteEvidence(e.id); go(fallback); } }]}
          onClose={() => setDeleting(false)}
        />
      )}
      <TabBar active="home" />
    </>
  );
}
