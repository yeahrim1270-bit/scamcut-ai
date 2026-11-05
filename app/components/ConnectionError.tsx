"use client";

import { useState } from "react";
import { downloadLocalCopy, hasLegacyOriginals, listLocalBackups } from "@/lib/backup";
import type { Store } from "@/lib/store";
import { Icon } from "./icons";

// 서버에 연결할 수 없을 때 보여 주는 화면. 이 기기에 저장돼 있던 자료는 지워지지 않았고, 여기서 내려받을 수 있습니다.
export default function ConnectionError({ store }: { store: Store }) {
  const [busy, setBusy] = useState(false);
  const hasLocal = hasLegacyOriginals() || listLocalBackups().length > 0;

  const retry = async () => {
    setBusy(true);
    await store.retry();
    setBusy(false);
  };

  return (
    <div className="app">
      <main className="page conn">
        <div className="conn-ic"><Icon name="info" size={34} /></div>
        <h1>서버에 연결할 수 없어요</h1>
        <p className="muted">{store.fatal ?? "백엔드 서버가 응답하지 않습니다."}</p>

        <div className="card" style={{ textAlign: "left" }}>
          <b className="small">백엔드 실행 방법 (PowerShell)</b>
          <pre className="code">cd C:\Users\user\scamcut-ai{"\n"}npm run dev:api</pre>
          <span className="hint">실행 후 아래 ‘다시 연결’을 눌러 주세요. 서버에 저장된 자료는 그대로 유지돼요.</span>
        </div>

        <button className="btn primary block lg" onClick={retry} disabled={busy}>
          {busy ? <><span className="spinner" /> 연결 중…</> : "다시 연결"}
        </button>
        {hasLocal && (
          <button className="btn outline block lg" style={{ marginTop: 10 }} onClick={() => downloadLocalCopy()}>
            이 기기에 저장된 자료 백업 받기
          </button>
        )}
      </main>
    </div>
  );
}
