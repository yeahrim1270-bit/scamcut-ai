// 규칙 기반 탐지 엔진 (브라우저에서만 실행, 외부 전송 없음)
// MULTI SCAN(위험 징후) + ACTION GUARD(위험 행동) + 엔티티 추출

import { ACCOUNT_RE, PHONE_RE, normalizePhone } from "./privacy";
import {
  levelOf,
  type ActionHit,
  type ActionType,
  type Entities,
  type EvidenceItem,
  type ItemRuleResult,
  type ScenarioId,
  type SignalHit,
  type Stage,
} from "./types";

interface SignalDef {
  id: string;
  label: string;
  weight: number;
  category: SignalHit["category"];
  scenario?: ScenarioId;
  keywords: string[]; // 공백 제거 후 소문자 비교
}

const SIGNALS: SignalDef[] = [
  {
    id: "gov_org",
    label: "수사·금융기관 명칭 언급",
    weight: 18,
    category: "impersonation",
    scenario: "gov",
    keywords: ["검찰", "검사", "수사관", "지검", "지방검찰청", "경찰청", "사이버수사대", "금융감독원", "금감원", "금융위원회", "국세청", "법원", "수사팀", "조사관"],
  },
  {
    id: "crime_involve",
    label: "범죄 연루·명의도용 주장",
    weight: 25,
    category: "threat",
    scenario: "gov",
    keywords: ["사건에연루", "범죄에연루", "연루되", "명의도용", "대포통장", "피의자", "구속영장", "체포영장", "자산보호", "안전계좌", "국가안전계좌", "공문", "출석요구", "자금세탁", "약식조사"],
  },
  {
    id: "family_phone",
    label: "가족 사칭 패턴(폰 고장·번호 변경)",
    weight: 28,
    category: "impersonation",
    scenario: "family",
    keywords: ["폰고장", "휴대폰고장", "핸드폰고장", "핸드폰이고장", "폰이고장", "액정이깨", "액정깨", "액정이나가", "임시폰", "번호가바뀌", "새번호", "폰을잃어", "수리맡겼", "수리중", "컴퓨터로문자"],
  },
  {
    id: "family_call",
    label: "가족 호칭으로 접근",
    weight: 6,
    category: "impersonation",
    scenario: "family",
    keywords: ["엄마", "아빠", "엄마나", "아빠나", "어머니", "아버지", "딸", "아들"],
  },
  {
    id: "loan",
    label: "저금리·대환 대출 권유",
    weight: 20,
    category: "lure",
    scenario: "loan",
    keywords: ["대환대출", "저금리", "정부지원대출", "서민대출", "햇살론", "대출승인", "기존대출상환", "신용등급상향", "한도조회", "대출가능", "특별승인", "선납금", "보증료"],
  },
  {
    id: "investment",
    label: "고수익·원금보장 투자 유인",
    weight: 22,
    category: "lure",
    scenario: "investment",
    keywords: ["리딩방", "고수익", "수익보장", "원금보장", "vip방", "급등주", "투자수익", "수익률", "코인투자", "공모주", "단톡방초대", "전문가리딩", "출금수수료"],
  },
  {
    id: "smishing",
    label: "스미싱 미끼(택배·부고·과태료 등)",
    weight: 15,
    category: "lure",
    scenario: "smishing",
    keywords: ["택배", "배송조회", "주소지불명", "주소불일치", "부고", "청첩장", "과태료", "범칙금", "건강검진", "쓰레기무단투기", "주소확인", "반송", "미납", "환급금"],
  },
  {
    id: "job",
    label: "고액 알바·통장/카드 대여",
    weight: 22,
    category: "lure",
    scenario: "job",
    keywords: ["고액알바", "재택알바", "통장대여", "체크카드대여", "수거알바", "현금수거", "단순업무", "일당", "카드를빌려", "통장을빌려"],
  },
  {
    id: "romance",
    label: "온라인 연인·해외 체류 접근",
    weight: 15,
    category: "lure",
    scenario: "romance",
    keywords: ["자기야", "보고싶어", "군의관", "해외파병", "유엔", "un평화유지", "통관비", "선물을보냈", "결혼하자"],
  },
  {
    id: "urgency",
    label: "시간 압박·긴급성 강조",
    weight: 10,
    category: "urgency",
    keywords: ["지금바로", "즉시", "오늘중", "오늘안에", "긴급", "급하게", "급해", "빨리", "시간이없", "24시간", "기한내", "마감", "당장"],
  },
  {
    id: "threat",
    label: "처벌·불이익 위협",
    weight: 15,
    category: "threat",
    keywords: ["처벌", "구속", "압류", "동결", "정지됩니다", "정지될", "불이익", "법적조치", "형사처벌", "고발", "벌금"],
  },
  {
    id: "secrecy",
    label: "비밀 유지·고립 유도",
    weight: 25,
    category: "secrecy",
    keywords: ["아무에게도", "비밀로", "말하지마", "알리지마", "알리면안", "전화끊지마", "끊지말", "은행직원에게", "수사중이니", "비밀유지", "다른사람에게", "가족에게도"],
  },
];

interface ActionDef {
  type: ActionType;
  severity: number;
  keywords: string[];
}

const ACTIONS: ActionDef[] = [
  { type: "TRANSFER", severity: 40, keywords: ["송금", "이체", "입금", "보내줘", "보내주", "보내야", "계좌로", "안전계좌", "옮겨", "결제해줘", "대신결제"] },
  { type: "OTP", severity: 35, keywords: ["인증번호", "인증코드", "otp", "보안카드", "확인코드", "인증문자"] },
  { type: "PERSONAL_INFO", severity: 30, keywords: ["주민등록번호", "주민번호", "신분증", "계좌비밀번호", "비밀번호", "카드번호", "cvc", "공인인증서", "공동인증서", "통장사본", "계좌번호알려", "개인정보"] },
  { type: "APP_INSTALL", severity: 35, keywords: ["앱설치", "어플설치", "앱을설치", "어플을설치", "설치해", "깔아", ".apk", "팀뷰어", "teamviewer", "애니데스크", "anydesk", "원격", "보안프로그램", "보안앱"] },
  { type: "CASH", severity: 40, keywords: ["현금인출", "현금으로", "현금을찾", "직접전달", "인출해", "직원에게전달", "직원이방문", "보관해", "물품보관함"] },
  { type: "GIFT_CARD", severity: 35, keywords: ["상품권", "문화상품권", "구글기프트", "기프트카드", "핀번호", "구글플레이카드"] },
  { type: "LINK", severity: 15, keywords: ["링크", "클릭", "접속해", "눌러", "확인하기", "아래주소"] },
];

const SHORTENERS = ["bit.ly", "han.gl", "me2.kr", "url.kr", "vo.la", "t.ly", "tinyurl.com", "shorturl.at", "goo.gl", "is.gd", "buly.kr", "c11.kr"];
const SUSPICIOUS_TLD = [".xyz", ".top", ".click", ".shop", ".icu", ".site", ".online", ".buzz", ".cyou", ".vip", ".live", ".info"];

const URL_RE = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|net|org|kr|xyz|top|ly|gl|me|io|shop|click|icu|site|info|online|buzz|cyou|vip|live|at|gd|la|cc)(?:\/[^\s]*)?)/gi;
const IP_URL_RE = /\bhttps?:\/\/\d{1,3}(?:\.\d{1,3}){3}/i;
const REP_NUMBER_RE = /(?<![\d-])1[5-8]\d{2}-?\d{4}(?![\d-])/g; // 1588-xxxx 등 대표번호
const AMOUNT_RE = /(\d[\d,]*(?:\.\d+)?)\s*(억|천만|백만|만|천)?\s*원/g;
const PERSON_RE = /([가-힣]{2,4})\s?(수사관|검사|팀장|과장|대리|주임|조사관|실장|부장|계장|경위|경감|형사)/g;
const ORG_LIST = ["서울중앙지검", "검찰청", "경찰청", "금융감독원", "금감원", "금융위원회", "국세청", "국민건강보험", "우체국", "CJ대한통운", "한진택배", "롯데택배", "국민은행", "신한은행", "우리은행", "하나은행", "농협", "기업은행", "카카오뱅크", "토스"];

function compact(s: string) {
  return s.toLowerCase().replace(/\s+/g, "");
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function parseAmount(num: string, unit?: string): number {
  const n = parseFloat(num.replace(/,/g, ""));
  if (isNaN(n)) return 0;
  const mult: Record<string, number> = { 억: 1e8, 천만: 1e7, 백만: 1e6, 만: 1e4, 천: 1e3 };
  return Math.round(n * (unit ? mult[unit] ?? 1 : 1));
}

export function extractEntities(text: string, sender = ""): Entities {
  const all = `${sender}\n${text}`;
  const phones = uniq([
    ...(all.match(PHONE_RE) ?? []).map(normalizePhone),
    ...(all.match(REP_NUMBER_RE) ?? []).map((p) => p.replace(/\D/g, "")),
  ]);
  const urls = uniq(
    (text.match(URL_RE) ?? [])
      .map((u) => u.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase().replace(/^www\./, ""))
      .filter((d) => d.includes(".") && !/^\d+(\.\d+)*$/.test(d)),
  );
  const ipUrl = text.match(IP_URL_RE);
  if (ipUrl) urls.push(ipUrl[0].replace(/^https?:\/\//i, ""));

  const phoneSet = new Set(phones);
  const accounts = uniq(
    [
      ...(text.match(ACCOUNT_RE) ?? []).map((a) => a.replace(/\D/g, "")),
      ...Array.from(text.matchAll(/(?:은행|뱅크|농협|우체국|새마을)\s*(?:계좌)?\s*:?\s*(\d[\d\s]{9,16}\d)/g)).map((m) => m[1].replace(/\D/g, "")),
    ].filter((a) => !phoneSet.has(a) && !/^01[016789]\d{7,8}$/.test(a)),
  );
  const amounts = Array.from(text.matchAll(AMOUNT_RE))
    .map((m) => parseAmount(m[1], m[2]))
    .filter((n) => n >= 1000);
  const persons = uniq(Array.from(text.matchAll(PERSON_RE)).map((m) => `${m[1]} ${m[2]}`));
  const ct = compact(text);
  const orgs = ORG_LIST.filter((o) => ct.includes(compact(o)));
  return { phones, urls, accounts, amounts: uniq(amounts), persons, orgs };
}

export function analyzeItem(item: EvidenceItem): ItemRuleResult {
  const ct = compact(item.content);
  const signals: SignalHit[] = [];

  for (const def of SIGNALS) {
    const matched = def.keywords.filter((k) => ct.includes(k));
    if (matched.length) {
      // 같은 범주에서 여러 키워드가 나오면 가중치 소폭 증가 (최대 1.5배)
      const w = Math.round(def.weight * Math.min(1.5, 1 + (matched.length - 1) * 0.25));
      signals.push({ id: def.id, label: def.label, weight: w, matched, scenario: def.scenario, category: def.category });
    }
  }

  const entities = extractEntities(item.content, item.sender);

  // 링크 위험 신호
  if (entities.urls.length) {
    const shortened = entities.urls.filter((u) => SHORTENERS.some((s) => u.endsWith(s)));
    const badTld = entities.urls.filter((u) => SUSPICIOUS_TLD.some((t) => u.endsWith(t)));
    const ip = entities.urls.filter((u) => /^\d+\.\d+\.\d+\.\d+/.test(u));
    signals.push({ id: "url", label: "메시지 내 링크 포함", weight: 10, matched: entities.urls, category: "link" });
    if (shortened.length) signals.push({ id: "short_url", label: "단축 URL 사용(목적지 은폐)", weight: 15, matched: shortened, category: "link" });
    if (badTld.length) signals.push({ id: "bad_tld", label: "의심 도메인(저가·비공식 TLD)", weight: 15, matched: badTld, category: "link" });
    if (ip.length) signals.push({ id: "ip_url", label: "IP 주소 직접 링크", weight: 20, matched: ip, category: "link" });
  }

  // 발신 출처 신호
  const s = compact(item.sender + " " + item.content.slice(0, 40));
  const originHits: string[] = [];
  if (/국제발신|해외발신|\[web발신\]국외|^\+(?!82)/.test(s)) originHits.push("국제발신");
  if (/^070|^\+8270/.test(item.sender.replace(/[\s-]/g, ""))) originHits.push("070 인터넷전화");
  if (originHits.length) signals.push({ id: "origin", label: "국제·인터넷 전화 발신", weight: 12, matched: originHits, category: "origin" });

  // 위험 행동 (ACTION GUARD)
  const actions: ActionHit[] = [];
  for (const def of ACTIONS) {
    const matched = def.keywords.filter((k) => ct.includes(k));
    if (def.type === "LINK" && entities.urls.length) matched.push(...entities.urls);
    if (def.type === "TRANSFER" && entities.accounts.length) matched.push("계좌번호 제시");
    if (matched.length) actions.push({ type: def.type, matched: uniq(matched), severity: def.severity });
  }

  const scenarios = uniq(signals.map((x) => x.scenario).filter((x): x is ScenarioId => !!x));

  // 점수 산정
  let score = signals.reduce((a, b) => a + b.weight, 0);
  score += actions.reduce((a, b) => a + b.severity, 0) * 0.7;
  const hasImpersonation = signals.some((x) => x.category === "impersonation" || x.category === "lure");
  const hasPressure = signals.some((x) => x.category === "threat" || x.category === "urgency" || x.category === "secrecy");
  const hasCritical = actions.some((a) => a.type !== "LINK");
  if (hasImpersonation && hasCritical) score += 15; // 사칭 + 금전/정보 요구 조합
  if (hasPressure && hasCritical) score += 10; // 압박 + 실행 요구 조합
  if (!hasImpersonation && !hasPressure && !hasCritical) score *= 0.6; // 단독 약신호 감쇠
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    itemId: item.id,
    score,
    level: levelOf(score),
    signals,
    actions,
    entities,
    scenarios,
    stage: stageOf(signals, actions),
  };
}

function stageOf(signals: SignalHit[], actions: ActionHit[]): Stage {
  if (actions.some((a) => a.type !== "LINK")) return "execute";
  if (signals.some((s) => s.category === "threat" || s.category === "secrecy" || s.category === "urgency")) return "pressure";
  if (signals.some((s) => s.category === "impersonation")) return "trust";
  return "contact";
}
