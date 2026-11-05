"use client";

import type { ReactNode } from "react";
import { CHANNEL_LABEL, type Channel } from "@/lib/types";
import type { Evidence, Incident } from "@/lib/models";
import { sortChrono } from "@/lib/models";
import { href } from "@/lib/route";
import { Icon, ShieldLogo, type IconName } from "./icons";

export const CHANNEL_ICON: Record<Channel, IconName> = { sms: "message-square", call: "phone", email: "mail" };

export function ChannelBadge({ channel }: { channel: Channel }) {
  return (
    <span className={`badge ch-${channel}`}>
      <Icon name={CHANNEL_ICON[channel]} size={13} /> {CHANNEL_LABEL[channel]}
    </span>
  );
}

const p2 = (n: number) => String(n).padStart(2, "0");
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export function fmtDateTime(s: string): string {
  if (!s) return "시각 미입력";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`;
}

// "2026-11-04" → "2026.11.04 (수)"
export function fmtDay(day: string): string {
  const d = new Date(`${day}T00:00`);
  if (isNaN(d.getTime())) return day;
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} (${WEEK[d.getDay()]})`;
}

export function fmtTime(s: string): string {
  const d = new Date(s);
  if (!s || isNaN(d.getTime())) return "시각 미입력";
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/* ---------- 상단 영역 ---------- */

export function BrandBar({ onBell }: { onBell: () => void }) {
  return (
    <header className="brandbar">
      <div className="brand">
        <ShieldLogo size={30} />
        <span>SCAM CUT AI</span>
      </div>
      <button className="bell" onClick={onBell} aria-label="알림">
        <Icon name="bell" size={22} />
      </button>
    </header>
  );
}

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="topbar">
      {onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">
          <Icon name="arrow-left" size={22} />
        </button>
      ) : (
        <span className="icon-btn ghost" />
      )}
      <h1>{title}</h1>
      <div className="topbar-right">{right}</div>
    </header>
  );
}

/* ---------- 하단 내비게이션 ---------- */

export type TabKey = "home" | "incidents" | "register" | "history" | "me";

export function TabBar({ active }: { active: TabKey }) {
  const cell = (key: TabKey, label: string, icon: IconName, to: string) => (
    <a key={key} href={to} className={`tab ${active === key ? "on" : ""}`}>
      <Icon name={icon} size={22} />
      <span>{label}</span>
    </a>
  );
  return (
    <nav className="tabbar" aria-label="하단 메뉴">
      <div className="tabbar-inner">
        {cell("home", "홈", "home", href.home)}
        {cell("incidents", "사건 목록", "clipboard", href.incidents)}
        <a href={href.evidenceNew()} className={`tab fab ${active === "register" ? "on" : ""}`} aria-label="자료 등록">
          <span className="fab-btn"><Icon name="plus" size={26} stroke={2.2} /></span>
        </a>
        {cell("history", "분석 내역", "file-text", href.history)}
        {cell("me", "내 정보", "user", href.me)}
      </div>
    </nav>
  );
}

/* ---------- 시트 / 확인 ---------- */

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-dim" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-grip" />
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmSheet({
  title,
  message,
  actions,
  onClose,
}: {
  title: string;
  message: string;
  actions: { label: string; danger?: boolean; onClick: () => void }[];
  onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>{message}</p>
      <div className="stack">
        {actions.map((a) => (
          <button
            key={a.label}
            className={`btn block ${a.danger ? "danger" : ""}`}
            onClick={() => {
              a.onClick();
              onClose();
            }}
          >
            {a.label}
          </button>
        ))}
        <button className="btn block ghost" onClick={onClose}>
          취소
        </button>
      </div>
    </Sheet>
  );
}

export function Empty({ icon, title, desc, children }: { icon: IconName; title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-ic"><Icon name={icon} size={28} /></div>
      <b>{title}</b>
      {desc && <p>{desc}</p>}
      {children}
    </div>
  );
}

export function Notice({ icon = "info", children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="notice">
      <Icon name={icon} size={16} />
      <div>{children}</div>
    </div>
  );
}

/* ---------- 사건 / 자료 카드 ---------- */

// 화면 상단의 사건 요약 카드
export function IncidentCard({ title, sub, onEdit }: { title: string; sub: string; onEdit?: () => void }) {
  return (
    <div className="inc-head">
      <span className="tile"><Icon name="folder" size={24} /></span>
      <div className="grow">
        <div className="inc-title">{title}</div>
        <div className="inc-sub">{sub}</div>
      </div>
      {onEdit && (
        <button className="icon-btn plain" onClick={onEdit} aria-label="사건 수정">
          <Icon name="pencil" size={19} />
        </button>
      )}
    </div>
  );
}

// 목록용 사건 행 (첫 자료의 채널 아이콘을 표시)
export function IncidentRow({ incident, items }: { incident: Incident; items: Evidence[] }) {
  const first = sortChrono(items)[0];
  return (
    <a className="row-card" href={href.incident(incident.id)}>
      <span className="tile"><Icon name={first ? CHANNEL_ICON[first.channel] : "folder"} size={22} /></span>
      <div className="grow">
        <div className="inc-title">{incident.title}</div>
        <div className="inc-sub">자료 {items.length}개 <i>|</i> {fmtDate(incident.createdAt)}</div>
      </div>
      <span className="chev"><Icon name="chevron-right" size={18} /></span>
    </a>
  );
}

// 타임라인·미분류 목록용 자료 카드 (누르면 자료 상세로 이동)
export function EvidenceRow({ e, showDate }: { e: Evidence; showDate?: boolean }) {
  const when = showDate && e.occurredAt ? `${fmtDate(e.occurredAt)} ${fmtTime(e.occurredAt)}` : fmtTime(e.occurredAt);
  return (
    <a className="tl-card" href={href.evidence(e.id)}>
      <div className={`tl-ch ch-${e.channel}`}>
        <span className="tl-ch-ic"><Icon name={CHANNEL_ICON[e.channel]} size={20} /></span>
        <span>{CHANNEL_LABEL[e.channel]}</span>
      </div>
      <div className="grow">
        <div className="tl-time">{when}</div>
        <div className="tl-text">{e.content}</div>
      </div>
      <span className="chev"><Icon name="chevron-right" size={18} /></span>
    </a>
  );
}
