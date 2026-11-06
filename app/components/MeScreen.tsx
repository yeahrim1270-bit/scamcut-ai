"use client";

import { useRef, useState } from "react";
import { downloadLocalCopy, listLocalBackups } from "@/lib/backup";
import { href } from "@/lib/route";
import type { Store } from "@/lib/store";
import { ConfirmSheet, Notice, TabBar, TopBar } from "./common";
import { Icon } from "./icons";

// 내 정보: 서버 저장소 상태, 백업·복원, 데이터 관리
export default function MeScreen({ store, go }: { store: Store; go: (to: string) => void }) {
  const { db, health } = store;
  const [wiping, setWiping] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState<"export" | "restore" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const empty = !db.incidents.length && !db.evidence.length && !db.jobs.length;
  const localBackups = listLocalBackups();

  const exportBackup = async () => {
    setBusy("export");
    try {
      await store.exportBackup();
      store.notify("info", "백업 파일을 내려받았어요.");
    } catch (e) {
      store.notify("error", e instanceof Error ? e.message : "백업을 만들지 못했어요.");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (file: File) => {
    setBusy("restore");
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("백업 파일이 너무 커요 (최대 20MB).");
      const r = await store.restoreBackup(await file.text());
      if (r) {
        const skip = r.incidents_skipped + r.evidence_skipped;
        store.notify(
          "info",
          `복원 완료: 사건 ${r.incidents_added}건·자료 ${r.evidence_added}건 추가` +
            (skip ? `, 이미 있는 ${skip}건은 건너뜀` : "") +
            (r.errors.length ? `, 형식 오류 ${r.errors.length}건 제외` : ""),
        );
      }
    } catch (e) {
      store.notify("error", e instanceof Error ? e.message : "복원하지 못했어요.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <TopBar title="내 정보" />
      <main className="page">
        {store.user ? (
          <>
            <div className="inc-head">
              <span className="tile"><Icon name="user" size={24} /></span>
              <div className="grow">
                <div className="inc-title">{store.user.name}님</div>
                <div className="inc-sub">{store.user.email}</div>
              </div>
              <button
                className="btn sm"
                disabled={leaving}
                onClick={async () => {
                  setLeaving(true);
                  const ok = await store.logout();
                  setLeaving(false);
                  store.notify(ok ? "info" : "error", ok ? "로그아웃되었어요." : "로그아웃하지 못했어요. 다시 시도해 주세요.");
                }}
              >
                {leaving ? "…" : "로그아웃"}
              </button>
            </div>
            <p className="hint" style={{ margin: "8px 4px 0" }}>시연용이라 사건·자료는 계정별로 나뉘지 않고 모두 같은 공간을 써요.</p>
          </>
        ) : (
          <div className="card">
            <div className="row" style={{ gap: 12, marginBottom: 12 }}>
              <span className="tile"><Icon name="user" size={24} /></span>
              <div className="grow">
                <div className="inc-title">로그인하지 않았어요</div>
                <div className="inc-sub">로그인하지 않아도 모든 기능을 쓸 수 있어요.</div>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary grow" onClick={() => go(href.login)}>로그인</button>
              <button className="btn grow" onClick={() => go(href.signup)}>회원가입</button>
            </div>
          </div>
        )}

        <div className="section"><h3>저장된 데이터</h3></div>
        <div className="card list-card">
          <div className="kv"><span>사건</span><b>{db.incidents.length}건</b></div>
          <div className="kv"><span>등록 자료</span><b>{db.evidence.length}개</b></div>
          <div className="kv"><span>분석 요청</span><b>{db.jobs.length}건</b></div>
        </div>

        <div className="section"><h3>서버 저장소</h3></div>
        <div className="card list-card">
          <div className="kv"><span>상태</span><b className={health ? "ok-text" : ""}>{health ? "연결됨" : "확인 불가"}</b></div>
          {health && (
            <>
              <div className="kv"><span>데이터베이스</span><b>{health.database === "sqlite" ? "SQLite (로컬 개발용)" : "외부 DB"}</b></div>
              <div className="kv"><span>서버 버전</span><b>v{health.version}</b></div>
              <div className="kv"><span>분석 엔진</span><b>{health.analyzers_implemented} / {health.analyzers_total}개 연결</b></div>
            </>
          )}
        </div>

        <div className="section"><h3>백업 · 복원</h3></div>
        <div className="stack">
          <button className="btn block lg" onClick={exportBackup} disabled={busy !== null}>
            {busy === "export" ? <><span className="spinner dark" /> 만드는 중…</> : <><Icon name="file-text" size={18} /> 백업 파일 내려받기</>}
          </button>
          <button className="btn block lg" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
            {busy === "restore" ? <><span className="spinner dark" /> 복원 중…</> : <><Icon name="plus-circle" size={18} /> 백업 파일에서 복원</>}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
          />
          <span className="hint">복원은 이미 있는 항목을 덮어쓰지 않고, 없는 항목만 추가해요.</span>
        </div>

        {localBackups.length > 0 && (
          <>
            <div className="section"><h3>이 기기에 보관된 이전 자료</h3></div>
            <div className="card">
              <p className="small muted" style={{ margin: "0 0 10px" }}>
                서버로 옮기기 전 이 기기에 있던 원본 {localBackups.length}개가 백업으로 보관돼 있어요.
              </p>
              <button className="btn block" onClick={() => downloadLocalCopy()}>이전 자료 백업 내려받기</button>
            </div>
          </>
        )}

        <div className="section"><h3>개인정보 보호</h3></div>
        <Notice icon="lock">
          입력한 자료는 이 PC에서 실행되는 서버의 데이터베이스에 저장되며 외부로 전송되지 않아요.
          주민등록번호, 계좌 비밀번호, 인증번호 같은 민감한 값은 입력하지 마세요.
        </Notice>

        <div className="section"><h3>데이터 관리</h3></div>
        <button className="btn danger-outline block" onClick={() => setWiping(true)} disabled={empty && !localBackups.length}>
          <Icon name="trash" size={18} /> 모든 데이터 삭제
        </button>
      </main>

      {wiping && (
        <ConfirmSheet
          title="모든 데이터를 삭제할까요?"
          message="서버의 사건·자료·분석 기록과 이 기기에 보관된 백업 사본이 모두 삭제되며 되돌릴 수 없습니다. 필요하면 먼저 백업 파일을 내려받으세요."
          actions={[{ label: "모두 삭제", danger: true, onClick: () => store.clearAll() }]}
          onClose={() => setWiping(false)}
        />
      )}
      <TabBar active="me" />
    </>
  );
}
