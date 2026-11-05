// 공통 타입 정의

export type Channel = "sms" | "call" | "email";

export const CHANNEL_LABEL: Record<Channel, string> = {
  sms: "문자",
  call: "전화",
  email: "이메일",
};

export interface EvidenceItem {
  id: string; // E1, E2 ...
  channel: Channel;
  sender: string; // 발신번호 / 대화명 (선택)
  occurredAt: string; // datetime-local 문자열 (선택)
  content: string; // 문자 본문, 통화 내용 메모, 이메일 본문
}

export type ScenarioId =
  | "gov"
  | "family"
  | "loan"
  | "investment"
  | "smishing"
  | "job"
  | "romance";

export const SCENARIO_LABEL: Record<ScenarioId, string> = {
  gov: "수사·금융기관 사칭",
  family: "가족·지인 사칭",
  loan: "대출 빙자",
  investment: "투자 리딩·고수익 사기",
  smishing: "스미싱(택배·부고·과태료 등)",
  job: "고액 알바·통장 대여",
  romance: "로맨스 스캠",
};

export type ActionType =
  | "TRANSFER"
  | "OTP"
  | "PERSONAL_INFO"
  | "LINK"
  | "APP_INSTALL"
  | "CASH"
  | "GIFT_CARD";

export const ACTION_LABEL: Record<ActionType, string> = {
  TRANSFER: "송금·이체",
  OTP: "인증번호 제공",
  PERSONAL_INFO: "개인·금융정보 제공",
  LINK: "링크 접속",
  APP_INSTALL: "앱 설치·원격제어",
  CASH: "현금 인출·전달",
  GIFT_CARD: "상품권·핀번호 전달",
};

export type Stage = "contact" | "trust" | "pressure" | "execute";

export const STAGE_LABEL: Record<Stage, string> = {
  contact: "① 접근",
  trust: "② 신뢰 형성",
  pressure: "③ 심리 압박",
  execute: "④ 실행 요구",
};

export type RiskLevel = "low" | "watch" | "caution" | "danger";

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "낮음",
  watch: "관심",
  caution: "주의",
  danger: "위험",
};

export interface SignalHit {
  id: string;
  label: string;
  weight: number;
  matched: string[];
  scenario?: ScenarioId;
  category: "impersonation" | "urgency" | "threat" | "secrecy" | "lure" | "link" | "origin";
}

export interface ActionHit {
  type: ActionType;
  matched: string[];
  severity: number;
}

export interface Entities {
  phones: string[]; // 정규화된 숫자열
  urls: string[]; // 도메인
  accounts: string[]; // 숫자만
  amounts: number[]; // 원 단위
  persons: string[]; // "김민수 수사관"
  orgs: string[];
}

export interface ItemRuleResult {
  itemId: string;
  score: number;
  level: RiskLevel;
  signals: SignalHit[];
  actions: ActionHit[];
  entities: Entities;
  scenarios: ScenarioId[];
  stage: Stage;
}

export interface LinkEdge {
  a: string;
  b: string;
  score: number;
  reasons: string[];
}

export interface RuleIncident {
  id: string;
  itemIds: string[]; // 시간순
  scenario: ScenarioId | null;
  risk: number;
  level: RiskLevel;
  channels: Channel[];
  stagesCovered: Stage[];
  edges: LinkEdge[];
  sharedEntities: string[];
  pattern: string; // 흐름 패턴 설명
  nextStep: string; // 예상 다음 단계
  requestedActions: ActionType[];
}

export interface RuleFlowResult {
  incidents: RuleIncident[];
  unlinked: string[];
  edges: LinkEdge[];
}

// ---- AI(Claude) 분석 결과 ----
export interface AiItem {
  id: string;
  risk_score: number;
  risk_level: RiskLevel;
  scam_type: string;
  signals: { label: string; evidence: string; explanation: string }[];
  risky_actions: { type: ActionType; evidence: string; why_dangerous: string }[];
  summary: string;
}

export interface AiIncident {
  title: string;
  scam_type: string;
  item_ids: string[];
  confidence: number;
  link_reasons: string[];
  timeline: { item_id: string; stage: Stage; description: string }[];
  narrative: string;
  predicted_next_step: string;
  overall_risk_score: number;
  overall_risk_level: RiskLevel;
}

export interface AiResult {
  items: AiItem[];
  incidents: AiIncident[];
  unlinked_item_ids: string[];
  safe_actions: { priority: number; action: string; reason: string }[];
  verify_targets: { claimed_identity: string; how_to_verify: string }[];
}

export interface AiResponse {
  ok: boolean;
  model?: string;
  result?: AiResult;
  error?: string;
  elapsedMs?: number;
}

export function levelOf(score: number): RiskLevel {
  if (score >= 70) return "danger";
  if (score >= 40) return "caution";
  if (score >= 15) return "watch";
  return "low";
}
