"use client";

// 이 기기(localStorage)에 있던 이전 자료를 서버로 옮길 때의 안전장치.
//  1) 서버로 보내기 전에 원본을 백업 키에 먼저 복사하고
//  2) 서버 저장이 성공한 뒤에만 원본 키를 지웁니다. (백업 사본은 사용자가 직접 지우기 전까지 유지)

const V2 = "scamcut.v2"; // STEP 1~2 에서 쓰던 저장 키
const V1 = "scamcut.items.v1"; // 그 이전 버전(자료만 저장)
export const BACKUP_PREFIX = "scamcut.backup.";

export interface LegacyPayload {
  incidents: unknown[];
  evidence: unknown[];
}
export interface LegacyData {
  payload: LegacyPayload;
  raw: string[]; // 백업할 원본 문자열
  corrupt: boolean;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function readLegacy(): LegacyData | null {
  const raw: string[] = [];
  const payload: LegacyPayload = { incidents: [], evidence: [] };
  let corrupt = false;

  const v2 = localStorage.getItem(V2);
  if (v2) {
    raw.push(v2);
    try {
      const p = JSON.parse(v2);
      if (Array.isArray(p.incidents)) payload.incidents.push(...p.incidents);
      if (Array.isArray(p.evidence)) payload.evidence.push(...p.evidence);
    } catch {
      corrupt = true;
    }
  }
  const v1 = localStorage.getItem(V1);
  if (v1) {
    raw.push(v1);
    try {
      const arr = JSON.parse(v1);
      if (Array.isArray(arr)) {
        // 같은 자료를 다시 보내도 중복되지 않도록 내용 기반의 고정 ID 를 부여
        arr.forEach((o: Record<string, unknown>, i: number) =>
          payload.evidence.push({ ...o, id: `v1-${i}-${hash(JSON.stringify(o))}`, incidentId: null }),
        );
      }
    } catch {
      corrupt = true;
    }
  }
  return raw.length ? { payload, raw, corrupt } : null;
}

export function saveLocalBackup(raw: string[]): void {
  const existing = new Set(listLocalBackups().map((b) => b.content));
  raw.forEach((r, i) => {
    if (existing.has(r)) return; // 같은 내용은 중복 보관하지 않음
    try {
      localStorage.setItem(`${BACKUP_PREFIX}${Date.now()}.${i}`, r);
    } catch {
      /* 저장 공간 부족 시에도 원본은 지우지 않으므로 손실 없음 */
    }
  });
}

export function listLocalBackups(): { key: string; content: string }[] {
  const out: { key: string; content: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(BACKUP_PREFIX)) out.push({ key: k, content: localStorage.getItem(k) ?? "" });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function clearLegacyOriginals(): void {
  localStorage.removeItem(V2);
  localStorage.removeItem(V1);
}

export function clearLocalBackups(): void {
  listLocalBackups().forEach((b) => localStorage.removeItem(b.key));
}

export function hasLegacyOriginals(): boolean {
  return !!(localStorage.getItem(V2) || localStorage.getItem(V1));
}

export function downloadFile(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// 서버에 연결할 수 없을 때도 쓸 수 있는 '이 기기 자료' 내려받기
export function downloadLocalCopy(): boolean {
  const parts = [...listLocalBackups().map((b) => b.content)];
  for (const k of [V2, V1]) {
    const v = localStorage.getItem(k);
    if (v) parts.push(v);
  }
  if (!parts.length) return false;
  downloadFile(`scamcut-local-copy-${stamp()}.json`, JSON.stringify(parts.map((p) => { try { return JSON.parse(p); } catch { return p; } }), null, 2));
  return true;
}
