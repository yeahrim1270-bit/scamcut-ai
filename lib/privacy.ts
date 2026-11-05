// 개인정보 마스킹 — AI 서버로 보내기 전에 브라우저에서 실행됩니다.
// 같은 번호/계좌는 같은 토큰([전화#1], [계좌#2])으로 치환하여
// 원본 값을 노출하지 않으면서도 AI가 "같은 번호가 여러 자료에 등장"하는 연결 고리를 파악할 수 있게 합니다.

import type { EvidenceItem } from "./types";

export interface MaskReport {
  phones: number;
  accounts: number;
  rrn: number;
  cards: number;
  secrets: number;
  emails: number;
}

const RRN = /(?<!\d)\d{6}\s?-\s?[1-4]\d{6}(?!\d)/g;
const CARD = /(?<!\d)\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}(?!\d)/g;
export const PHONE_RE = /(?<![\d-])(?:\+?82[-\s.]?|0)(?:1[016789]|2|[3-6][1-5]|70|80|50\d?)[-\s.)]?\d{3,4}[-\s.]?\d{4}(?![\d-])/g;
export const ACCOUNT_RE = /(?<![\d-])\d{2,6}-\d{2,6}-\d{2,8}(?:-\d{1,3})?(?![\d-])/g;
const BANK_ACCOUNT = /((?:국민|신한|우리|하나|농협|기업|카카오뱅크|카카오|토스뱅크|토스|새마을|우체국|SC제일|씨티|수협|부산|대구|경남|광주|전북|제주|케이뱅크)(?:은행)?\s*(?:계좌)?\s*:?\s*)(\d[\d\s]{9,16}\d)/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// "인증번호 123456", "비밀번호는 1234" 처럼 키워드 뒤에 붙은 숫자/문자
const SECRET = /((?:인증\s?번호|인증\s?코드|OTP|otp|비밀\s?번호|비번|CVC|cvc|핀\s?번호|PIN)\s*(?:는|은|:|=)?\s*)([A-Za-z0-9]{4,8})/g;

export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("82")) d = "0" + d.slice(2);
  return d;
}

export function createMasker() {
  const phoneMap = new Map<string, string>();
  const accountMap = new Map<string, string>();
  const emailMap = new Map<string, string>();
  const report: MaskReport = { phones: 0, accounts: 0, rrn: 0, cards: 0, secrets: 0, emails: 0 };

  const tokenFor = (map: Map<string, string>, key: string, prefix: string) => {
    if (!map.has(key)) map.set(key, `[${prefix}#${map.size + 1}]`);
    return map.get(key)!;
  };

  function mask(text: string): string {
    if (!text) return text;
    let t = text;
    t = t.replace(RRN, () => (report.rrn++, "[주민번호]"));
    t = t.replace(CARD, () => (report.cards++, "[카드번호]"));
    t = t.replace(SECRET, (_m, kw) => (report.secrets++, `${kw}[비밀값]`));
    t = t.replace(EMAIL, (m) => (report.emails++, tokenFor(emailMap, m.toLowerCase(), "이메일")));
    t = t.replace(BANK_ACCOUNT, (_m, prefix, num) => {
      report.accounts++;
      return prefix + tokenFor(accountMap, num.replace(/\D/g, ""), "계좌");
    });
    t = t.replace(PHONE_RE, (m) => (report.phones++, tokenFor(phoneMap, normalizePhone(m), "전화")));
    t = t.replace(ACCOUNT_RE, (m) => (report.accounts++, tokenFor(accountMap, m.replace(/\D/g, ""), "계좌")));
    return t;
  }

  return { mask, report };
}

export function maskItems(items: EvidenceItem[]): { masked: EvidenceItem[]; report: MaskReport } {
  const m = createMasker();
  const masked = items.map((it) => ({
    ...it,
    sender: m.mask(it.sender),
    content: m.mask(it.content),
  }));
  return { masked, report: m.report };
}
