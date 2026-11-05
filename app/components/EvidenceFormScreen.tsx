"use client";

import { useState } from "react";
import { href } from "@/lib/route";
import type { Store } from "@/lib/store";
import { CHANNEL_LABEL, type Channel } from "@/lib/types";
import { CHANNEL_ICON, ConfirmSheet, Empty, IncidentCard, Notice, TabBar, TopBar } from "./common";
import { Icon } from "./icons";

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const NEW_INCIDENT = "__new__";
const MAX = 3000;

// 자료 등록(새로 만들기) / 수정 공용 화면
export default function EvidenceFormScreen({
  editId,
  presetIncidentId,
  store,
  go,
  back,
}: {
  editId?: string;
  presetIncidentId?: string | null;
  store: Store;
  go: (to: string) => void;
  back: (fallback: string) => void;
}) {
  const existing = editId ? store.db.evidence.find((e) => e.id === editId) : undefined;
  const preset = presetIncidentId && store.db.incidents.some((i) => i.id === presetIncidentId) ? presetIncidentId : "";

  const [channel, setChannel] = useState<Channel>(existing?.channel ?? "sms");
  const [sender, setSender] = useState(existing?.sender ?? "");
  const [occurredAt, setOccurredAt] = useState(existing ? existing.occurredAt : nowLocal());
  const [content, setContent] = useState(existing?.content ?? "");
  const [incidentSel, setIncidentSel] = useState<string>(existing?.incidentId ?? preset);
  const [newTitle, setNewTitle] = useState("");
  const [touched, setTouched] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (editId && !existing) {
    return (
      <>
        <TopBar title="자료 수정" onBack={() => go(href.home)} />
        <main className="page">
          <Empty icon="search" title="자료를 찾을 수 없습니다" desc="이미 삭제되었을 수 있습니다.">
            <a className="btn primary" href={href.home}>홈으로</a>
          </Empty>
        </main>
        <TabBar active="home" />
      </>
    );
  }

  const contentInvalid = !content.trim();
  const titleInvalid = incidentSel === NEW_INCIDENT && !newTitle.trim();
  const fallback = existing?.incidentId ? href.incident(existing.incidentId) : preset ? href.incident(preset) : href.home;
  const selected = store.db.incidents.find((i) => i.id === incidentSel);

  const save = () => {
    setTouched(true);
    if (contentInvalid || titleInvalid) return;
    let incidentId: string | null = incidentSel || null;
    if (incidentSel === NEW_INCIDENT) incidentId = store.addIncident(newTitle.trim(), "");
    const input = { incidentId, channel, sender: sender.trim(), occurredAt, content: content.trim() };
    if (existing) store.updateEvidence(existing.id, input);
    else store.addEvidence(input);
    go(incidentId ? href.incident(incidentId) : href.home);
  };

  return (
    <>
      <TopBar title={existing ? "자료 수정" : "자료 등록"} onBack={() => back(fallback)} />
      <main className="page">
        <IncidentCard
          title={incidentSel === NEW_INCIDENT ? newTitle.trim() || "새 사건" : selected?.title ?? "미분류 자료"}
          sub={existing ? "자료를 수정합니다." : selected ? "사건에 자료를 추가합니다." : "사건을 선택하면 연결됩니다."}
        />

        <div className="field" style={{ marginTop: 18 }}>
          <label>자료 유형 <em>*</em></label>
          <div className="type-grid">
            {(["sms", "call", "email"] as Channel[]).map((c) => (
              <button key={c} type="button" className={`type-tile ${channel === c ? "on" : ""}`} onClick={() => setChannel(c)}>
                <Icon name={CHANNEL_ICON[c]} size={24} />
                <span>{CHANNEL_LABEL[c]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>{channel === "email" ? "발신 이메일 주소" : "발신번호"} <small>(선택)</small></label>
          <input
            value={sender}
            maxLength={60}
            placeholder={channel === "email" ? "예: notice@example.com" : "예: 02-1234-5678"}
            onChange={(e) => setSender(e.target.value)}
          />
        </div>

        <div className="field">
          <label>발생 일시 <em>*</em></label>
          <div className="input-icon">
            <Icon name="calendar" size={18} />
            <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </div>
          <span className="hint">비워 두면 타임라인 맨 아래 ‘시각 미입력’에 표시됩니다.</span>
        </div>

        <div className="field">
          <label>내용 <em>*</em></label>
          <textarea
            value={content}
            maxLength={MAX}
            placeholder={channel === "call" ? "상대가 한 말과 요구한 내용을 기억나는 대로 적어 주세요." : "받은 내용을 그대로 붙여넣어 주세요."}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="row between">
            {touched && contentInvalid ? <span className="err">내용을 입력해 주세요.</span> : <span />}
            <span className="hint">{content.length} / {MAX}</span>
          </div>
        </div>

        <div className="field">
          <label>연결할 사건</label>
          <select value={incidentSel} onChange={(e) => setIncidentSel(e.target.value)}>
            <option value="">미분류 (나중에 연결)</option>
            {store.db.incidents.map((i) => (
              <option key={i.id} value={i.id}>{i.title}</option>
            ))}
            <option value={NEW_INCIDENT}>+ 새 사건 만들기</option>
          </select>
          {incidentSel === NEW_INCIDENT && (
            <>
              <input value={newTitle} maxLength={40} placeholder="새 사건 이름" onChange={(e) => setNewTitle(e.target.value)} />
              {touched && titleInvalid && <span className="err">사건 이름을 입력해 주세요.</span>}
            </>
          )}
        </div>

        <Notice icon="lock">이 기기에만 저장됩니다. 주민등록번호, 계좌 비밀번호, 인증번호는 입력하지 마세요.</Notice>

        <div className="stack" style={{ marginTop: 16 }}>
          <button className="btn primary block lg" onClick={save}>
            <Icon name="plus-circle" size={20} /> {existing ? "수정 저장" : "자료 추가"}
          </button>
          <button className="btn outline block lg" onClick={() => back(fallback)}>취소</button>
          {existing && (
            <button className="text-danger" onClick={() => setDeleting(true)}>
              <Icon name="trash" size={16} /> 이 자료 삭제
            </button>
          )}
        </div>
      </main>

      {deleting && existing && (
        <ConfirmSheet
          title="자료를 삭제할까요?"
          message="삭제한 자료는 되돌릴 수 없습니다."
          actions={[
            {
              label: "삭제",
              danger: true,
              onClick: () => {
                store.deleteEvidence(existing.id);
                go(existing.incidentId ? href.incident(existing.incidentId) : href.home);
              },
            },
          ]}
          onClose={() => setDeleting(false)}
        />
      )}
      <TabBar active={existing ? "home" : "register"} />
    </>
  );
}
