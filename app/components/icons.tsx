import type { ReactNode } from "react";

// 선형(line) 아이콘 모음 — 이모지 대신 사용합니다. (24x24, currentColor)
const P = {
  home: (<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>),
  clipboard: (<><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 12h6M9 16h4" /></>),
  "file-text": (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></>),
  user: (<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  "plus-circle": (<><circle cx="12" cy="12" r="9.5" /><path d="M12 8v8M8 12h8" /></>),
  bell: (<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>),
  "message-square": <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  "message-circle": <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  mail: (<><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><path d="M22 6l-10 7L2 6" /></>),
  search: (<><circle cx="11" cy="11" r="7.5" /><path d="M21 21l-4.3-4.3" /></>),
  network: (<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></>),
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  "shield-check": (<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>),
  bank: (<><path d="M3 21h18M5 21V10M9.5 21V10M14.5 21V10M19 21V10" /><path d="M12 3L2.5 9h19z" /></>),
  folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  "chevron-right": <path d="M9 18l6-6-6-6" />,
  "arrow-left": <path d="M19 12H5M12 19l-7-7 7-7" />,
  pencil: <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />,
  calendar: (<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  info: (<><circle cx="12" cy="12" r="9.5" /><path d="M12 16v-4M12 8h.01" /></>),
  lock: (<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  trash: (<><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>),
  "check-circle": (<><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" /><path d="M22 4L12 14l-3-3" /></>),
  clock: (<><circle cx="12" cy="12" r="9.5" /><path d="M12 6.5V12l3.5 2" /></>),
} as const;

export type IconName = keyof typeof P;

export function Icon({ name, size = 22, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name] as ReactNode}
    </svg>
  );
}

// 앱 로고(방패)
export function ShieldLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2.5l11 4v8.2c0 7.2-4.7 12.1-11 14.8C9.7 26.8 5 21.900 5 14.700V6.500z" fill="#2b60e0" />
      <path d="M11 15.500l3.600 3.600L21.500 12" fill="none" stroke="#fff" strokeWidth="2.600" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 메인 히어로 일러스트 (단색 계열의 평면 방패)
export function HeroShield() {
  return (
    <svg viewBox="0 0 120 140" width="100%" height="100%" aria-hidden="true">
      <path d="M60 6l48 17v36c0 33-20 56-48 75C32 115 12 92 12 59V23z" fill="#cfe0ff" />
      <path d="M60 18l37 13v28c0 25-15 43-37 58-22-15-37-33-37-58V31z" fill="#7aa5f7" />
      <path d="M42 66l13 13 24-26" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
