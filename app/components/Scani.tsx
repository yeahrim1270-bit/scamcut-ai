"use client";

import { useState } from "react";
import { href } from "@/lib/route";
import type { ScaniLine, ScaniStage } from "@/lib/scani";
import { ACTION_LABEL, type ActionType } from "@/lib/types";
import { ACTION_GUARD_TIPS, EMERGENCY_STEPS, OFFICIAL_CONTACTS } from "@/lib/verify";
import { Notice, Sheet } from "./common";
import { Icon, type IconName } from "./icons";

const IMG = "/images/scani.png";

export function ScaniAvatar({ size = 56, alt = "" }: { size?: number; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={IMG} alt={alt} width={size} height={size} draggable={false} className="scani-img" />;
}

// 단계(stage)에 따라 문구와 색이 바뀌는 안내 말풍선
export function ScaniMessage({ stage, line, onClick }: { stage: ScaniStage; line: ScaniLine; onClick?: () => void }) {
  const body = (
    <>
      <ScaniAvatar size={48} />
      <div className="grow">
        <b>{line.title}</b>
        <p>{line.text}</p>
      </div>
      {onClick && <Icon name="chevron-right" size={18} />}
    </>
  );
  const cls = `scani-msg stage-${stage}`;
  return onClick ? (
    <button className={cls} onClick={onClick} aria-label="스캔이 AI 도우미 열기">{body}</button>
  ) : (
    <div className={cls} role="status">{body}</div>
  );
}

type GuideKey = "register" | "flow" | "guard" | "verify";

const MENUS: { key: GuideKey; title: string; desc: string; icon: IconName }[] = [
  { key: "register", title: "자료 등록 방법", desc: "문자·전화·이메일를 사건에 담는 법", icon: "plus-circle" },
  { key: "flow", title: "SCAM FLOW 사건 연결", desc: "흩어진 자료를 하나의 사건으로 보기", icon: "network" },
  { key: "guard", title: "위험 행동 예방", desc: "송금·인증번호·링크 등 멈춰야 할 행동", icon: "shield-check" },
  { key: "verify", title: "안전 확인 방법", desc: "공식 경로로 확인하고 신고하는 법", icon: "bank" },
];

const GUARD_ORDER: ActionType[] = ["TRANSFER", "OTP", "PERSONAL_INFO", "LINK", "APP_INSTALL", "CASH", "GIFT_CARD"];

function RegisterGuide({ nav }: { nav: (to: string) => void }) {
  return (
    <>
      <ol className="steps">
        <li><b>하단 가운데 + 버튼</b>을 눌러 자료 등록 화면을 엽니다.</li>
        <li><b>자료 유형</b>(문자·전화·이메일)을 고릅니다.</li>
        <li><b>발생 일시</b>와 <b>내용</b>을 입력합니다. 전화는 상대가 한 말을 메모로 적어 주세요.</li>
        <li><b>연결할 사건</b>을 고르거나 새 사건을 만듭니다. 나중에 연결하려면 ‘미분류’로 두세요.</li>
        <li>저장하면 사건 타임라인에 <b>시간 순서대로</b> 정리됩니다.</li>
      </ol>
      <Notice icon="lock">주민등록번호, 계좌 비밀번호, 인증번호는 입력하지 마세요. 자료는 이 기기에만 저장됩니다.</Notice>
      <button className="btn primary block lg" style={{ marginTop: 14 }} onClick={() => nav(href.evidenceNew())}>
        자료 등록하러 가기
      </button>
    </>
  );
}

function FlowGuide({ nav }: { nav: (to: string) => void }) {
  return (
    <>
      <p className="g-p">SCAM FLOW는 문자·전화·이메일에 흩어진 자료를 <b>하나의 사건</b>으로 묶어, 사기가 어떤 순서로 진행됐는지 보여 주는 기능이에요.</p>
      <div className="g-box">
        <b>지금 사용할 수 있는 것</b>
        <ul>
          <li>자료를 사건별로 모아 두기</li>
          <li>사건 타임라인에서 시간 순서대로 보기</li>
        </ul>
      </div>
      <div className="g-box pending">
        <b>AI 분석 연결 후 제공 예정</b>
        <ul>
          <li>같은 번호·계좌·링크 등 자료 사이의 연결고리 찾기</li>
          <li>접근 → 신뢰 형성 → 압박 → 실행 요구 단계로 흐름 설명</li>
        </ul>
        <small>아직 연결되지 않아 분석 결과는 표시되지 않아요.</small>
      </div>
      <button className="btn primary block lg" style={{ marginTop: 14 }} onClick={() => nav(href.incidents)}>
        사건 목록 보기
      </button>
    </>
  );
}

function GuardGuide() {
  return (
    <>
      <p className="g-p">아래 행동을 요구받으면 <b>바로 따르지 말고 멈춰서</b> 확인하세요. 일반적인 예방 수칙이며, 입력한 자료를 분석한 결과가 아니에요.</p>
      <div className="stack">
        {GUARD_ORDER.map((t) => (
          <div className="g-item" key={t}>
            <b>{ACTION_LABEL[t]}</b>
            <p>{ACTION_GUARD_TIPS[t].stop}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function VerifyGuide() {
  return (
    <>
      <Notice icon="info">문자·통화에 적힌 번호나 링크로는 확인하지 마세요. 직접 검색한 공식 번호로 확인해야 해요.</Notice>
      <div className="section" style={{ marginTop: 16 }}><h3 style={{ fontSize: 15 }}>공식 신고·확인 경로</h3></div>
      <div className="card list-card">
        {OFFICIAL_CONTACTS.map((c) => (
          <div className="contact" key={c.name}>
            <div className="grow">
              <b>{c.name}</b>
              <div className="small muted">{c.desc}</div>
            </div>
            {c.tel ? (
              <a className="callbtn" href={`tel:${c.tel}`}>{c.tel}</a>
            ) : (
              <a className="callbtn light" href={c.url} target="_blank" rel="noopener noreferrer">열기</a>
            )}
          </div>
        ))}
      </div>
      <div className="section"><h3 style={{ fontSize: 15 }}>이미 피해를 입었다면</h3></div>
      <ul className="g-list">
        {EMERGENCY_STEPS.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </>
  );
}

export function ScaniGuideSheet({
  stage,
  line,
  go,
  onClose,
}: {
  stage: ScaniStage;
  line: ScaniLine;
  go: (to: string) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<GuideKey | null>(null);
  const menu = MENUS.find((m) => m.key === view);
  const nav = (to: string) => {
    onClose();
    go(to);
  };

  return (
    <Sheet title="스캔이 AI 도우미" onClose={onClose}>
      <div className={`scani-head stage-${stage}`}>
        <ScaniAvatar size={64} />
        <div className="bubble">
          <b>{line.title}</b>
          <p>{line.text}</p>
        </div>
      </div>

      {!menu ? (
        <div className="stack" style={{ marginTop: 14 }}>
          {MENUS.map((m) => (
            <button key={m.key} className="guide-menu" onClick={() => setView(m.key)}>
              <span className="tile"><Icon name={m.icon} size={22} /></span>
              <span className="grow">
                <b>{m.title}</b>
                <small>{m.desc}</small>
              </span>
              <Icon name="chevron-right" size={18} />
            </button>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <button className="g-back" onClick={() => setView(null)}>
            <Icon name="arrow-left" size={16} /> 메뉴로
          </button>
          <h3 className="g-title">{menu.title}</h3>
          {view === "register" && <RegisterGuide nav={nav} />}
          {view === "flow" && <FlowGuide nav={nav} />}
          {view === "guard" && <GuardGuide />}
          {view === "verify" && <VerifyGuide />}
        </div>
      )}
    </Sheet>
  );
}
