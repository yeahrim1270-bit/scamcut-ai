// 사건 타임라인용 정보: 자료별 한 줄 요약, 자료 사이의 '연결 근거'.
// 모두 서버의 MULTI SCAN 분석 결과(실제 탐지)에서만 만들며, 분석 결과가 없으면 만들지 않습니다.
import type { MultiScanData, MultiScanEvidence } from "./analysis";
import type { Evidence } from "./models";

const ACTION_SHORT: Record<string, string> = {
  TRANSFER: "송금",
  OTP: "인증번호",
  CARD_INFO: "카드정보",
  PERSONAL_INFO: "개인정보",
  LINK: "링크 접속",
  APP_INSTALL: "앱 설치",
  CASH_GIFT: "현금·상품권",
};

const clip = (s: string, n = 34) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
};

// 자료 한 줄 요약: 분석 결과가 있으면 탐지된 내용, 없으면 원문 앞부분
export function oneLine(e: Evidence, a?: MultiScanEvidence): string {
  if (a) {
    if (a.actions.length) {
      const names = [...new Set(a.actions.map((x) => ACTION_SHORT[x.action] ?? x.name))];
      return `${names.join("·")} 요구`;
    }
    if (a.impersonation.length) {
      const i = a.impersonation[0];
      return `${i.name ?? i.category_name} 사칭 표현`;
    }
    if (a.topics.length) return `${a.topics[0].name} 관련 안내`;
    return a.classification.label;
  }
  return clip(e.content);
}

// 둘 이상의 자료에서 공통으로 나타난 것들(사실 기반)
export function connectionReasons(scan: MultiScanData | null): string[] {
  if (!scan || scan.evidence.length < 2) return [];
  const ev = scan.evidence;
  const out: string[] = [];

  const sharedOf = (pick: (e: MultiScanEvidence) => string[]) => {
    const count = new Map<string, number>();
    ev.forEach((e) => new Set(pick(e)).forEach((v) => count.set(v, (count.get(v) ?? 0) + 1)));
    return [...count.entries()].filter(([, n]) => n >= 2).map(([v]) => v);
  };

  const topics = sharedOf((e) => e.topics.map((t) => t.name));
  if (topics.length) out.push(`같은 주제(${topics.slice(0, 2).join("·")})`);
  const domains = sharedOf((e) => e.entities.urls.map((u) => u.domain));
  if (domains.length) out.push(`같은 링크 주소(${domains[0]})`);
  if (sharedOf((e) => e.entities.phones).length) out.push("같은 전화번호");
  if (sharedOf((e) => e.entities.accounts).length) out.push("같은 계좌번호");
  const persons = sharedOf((e) => e.entities.persons);
  if (persons.length) out.push(`같은 인물 언급(${persons[0]})`);
  const orgs = sharedOf((e) => e.entities.orgs.map((o) => o.name));
  if (orgs.length) out.push(`같은 기관·업체 언급(${orgs[0]})`);
  const imps = sharedOf((e) => e.impersonation.map((i) => i.category_name));
  if (imps.length) out.push(`같은 사칭 유형(${imps[0]})`);

  // 앞 자료에는 없던 행동 요구가 뒤 자료에서 나타나는 경우
  const firstAction = ev.findIndex((e) => e.actions.length > 0);
  if (firstAction > 0) out.push("뒤 자료에서 행동 요구가 나타남");

  return out.slice(0, 4);
}
