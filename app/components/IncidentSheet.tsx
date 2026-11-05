"use client";

import { useState } from "react";
import { Sheet } from "./common";

// 사건 만들기 / 수정 공용 시트
export default function IncidentSheet({
  initial,
  onSave,
  onClose,
}: {
  initial?: { title: string; memo: string };
  onSave: (title: string, memo: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [touched, setTouched] = useState(false);
  const invalid = !title.trim();

  return (
    <Sheet title={initial ? "사건 수정" : "새 사건 만들기"} onClose={onClose}>
      <div className="field">
        <label>사건 이름 *</label>
        <input
          autoFocus
          value={title}
          maxLength={40}
          placeholder="예: 검찰 사칭 전화 건"
          onChange={(e) => setTitle(e.target.value)}
        />
        {touched && invalid && <span className="err">사건 이름을 입력해 주세요.</span>}
      </div>
      <div className="field">
        <label>메모 (선택)</label>
        <textarea
          style={{ minHeight: 80 }}
          value={memo}
          maxLength={300}
          placeholder="어떤 일이 있었는지 간단히 적어 두세요."
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>
      <button
        className="btn primary block"
        onClick={() => {
          setTouched(true);
          if (invalid) return;
          onSave(title.trim(), memo.trim());
          onClose();
        }}
      >
        {initial ? "저장" : "사건 만들기"}
      </button>
    </Sheet>
  );
}
