"use client";

import { useEffect } from "react";
import type { Store } from "@/lib/store";
import { Icon } from "./icons";

// 저장 중 표시와 오류·안내 알림 (하단 내비 위에 표시)
export default function SyncToast({ store }: { store: Store }) {
  const { notice, saving, dismissNotice } = store;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismissNotice, notice.kind === "error" ? 9000 : 6000);
    return () => clearTimeout(t);
  }, [notice, dismissNotice]);

  if (!notice && !saving) return null;
  return (
    <div className="toast-wrap" aria-live="polite">
      {notice && (
        <div className={`toast ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          <Icon name={notice.kind === "error" ? "info" : "check-circle"} size={18} />
          <span className="grow">{notice.text}</span>
          <button onClick={dismissNotice} aria-label="알림 닫기">✕</button>
        </div>
      )}
      {saving && !notice && (
        <div className="toast saving" role="status">
          <span className="spinner dark" /> 서버에 저장 중…
        </div>
      )}
    </div>
  );
}
