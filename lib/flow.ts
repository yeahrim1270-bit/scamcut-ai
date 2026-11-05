// SCAM FLOW — 규칙 기반 사건 연결 엔진
// 1) 자료 쌍마다 연결 점수 계산 (공유 번호·계좌·도메인·인물, 시나리오 일치, 시간 근접성, 단계 진행)
// 2) 임계값 이상이면 간선으로 보고 Union-Find로 사건(클러스터) 구성
// 3) 사건별 타임라인·단계 커버리지·예상 다음 단계 산출

import {
  CHANNEL_LABEL,
  SCENARIO_LABEL,
  levelOf,
  type ActionType,
  type Channel,
  type EvidenceItem,
  type ItemRuleResult,
  type LinkEdge,
  type RuleFlowResult,
  type RuleIncident,
  type ScenarioId,
  type Stage,
} from "./types";

export const LINK_THRESHOLD = 35;
const STAGE_ORDER: Stage[] = ["contact", "trust", "pressure", "execute"];

function mask(v: string) {
  if (v.length <= 4) return v;
  return v.slice(0, 3) + "*".repeat(Math.max(0, v.length - 7)) + v.slice(-4);
}

function timeOf(item: EvidenceItem, idx: number): number {
  const t = item.occurredAt ? Date.parse(item.occurredAt) : NaN;
  return isNaN(t) ? Number.NaN : t + idx * 0; // idx 는 정렬 안정성용
}

export function scorePair(
  a: EvidenceItem,
  b: EvidenceItem,
  ra: ItemRuleResult,
  rb: ItemRuleResult,
): LinkEdge {
  let score = 0;
  const reasons: string[] = [];
  const inter = <T,>(x: T[], y: T[]) => x.filter((v) => y.includes(v));

  const sharedPhones = inter(ra.entities.phones, rb.entities.phones);
  if (sharedPhones.length) {
    score += 45;
    reasons.push(`동일 전화번호 등장: ${sharedPhones.map(mask).join(", ")}`);
  }
  const sharedAcc = inter(ra.entities.accounts, rb.entities.accounts);
  if (sharedAcc.length) {
    score += 50;
    reasons.push(`동일 계좌번호 등장: ${sharedAcc.map(mask).join(", ")}`);
  }
  const sharedUrl = inter(ra.entities.urls, rb.entities.urls);
  if (sharedUrl.length) {
    score += 40;
    reasons.push(`동일 링크 도메인: ${sharedUrl.join(", ")}`);
  }
  const sharedPerson = inter(ra.entities.persons, rb.entities.persons);
  if (sharedPerson.length) {
    score += 35;
    reasons.push(`동일 인물·직함 언급: ${sharedPerson.join(", ")}`);
  } else {
    // 이름만 같은 경우 (예: '김민수 수사관' ↔ '김민수 검사')
    const na = ra.entities.persons.map((p) => p.split(" ")[0]);
    const nb = rb.entities.persons.map((p) => p.split(" ")[0]);
    const sn = inter(na, nb);
    if (sn.length) {
      score += 25;
      reasons.push(`동일 이름 언급: ${sn.join(", ")}`);
    }
  }
  const sharedOrg = inter(ra.entities.orgs, rb.entities.orgs);
  if (sharedOrg.length) {
    score += 15;
    reasons.push(`동일 기관명 언급: ${sharedOrg.join(", ")}`);
  }
  const sharedAmt = inter(ra.entities.amounts, rb.entities.amounts);
  if (sharedAmt.length) {
    score += 15;
    reasons.push(`동일 금액 언급: ${sharedAmt.map((n) => n.toLocaleString("ko-KR") + "원").join(", ")}`);
  }
  const sa = a.sender.trim().replace(/[\s-]/g, "");
  const sb = b.sender.trim().replace(/[\s-]/g, "");
  if (sa && sb && sa === sb && !sharedPhones.length) {
    score += 40;
    reasons.push(`동일 발신자: ${a.sender}`);
  }

  const sharedScen = inter(ra.scenarios, rb.scenarios);
  if (sharedScen.length) {
    score += 20;
    reasons.push(`같은 사기 유형 징후: ${sharedScen.map((s) => SCENARIO_LABEL[s]).join(", ")}`);
  }

  // 시간 근접성 (위험 신호가 있는 자료끼리만 가산)
  const ta = timeOf(a, 0);
  const tb = timeOf(b, 0);
  const bothRisky = ra.score >= 15 && rb.score >= 15;
  if (!isNaN(ta) && !isNaN(tb) && bothRisky) {
    const h = Math.abs(ta - tb) / 3.6e6;
    if (h <= 3) {
      score += 15;
      reasons.push(`3시간 이내 연속 발생 (${h.toFixed(1)}시간 간격)`);
    } else if (h <= 24) {
      score += 8;
      reasons.push(`24시간 이내 발생 (${Math.round(h)}시간 간격)`);
    }
  }

  // 단계 진행 (먼저 온 자료 → 다음 단계로 이어짐)
  if (bothRisky && a.channel !== b.channel && sharedScen.length) {
    score += 5;
    reasons.push(`채널 전환: ${CHANNEL_LABEL[a.channel]} ↔ ${CHANNEL_LABEL[b.channel]}`);
  }

  return { a: a.id, b: b.id, score, reasons };
}

const NEXT_STEP: Record<ScenarioId, string> = {
  gov: "‘자산 보호’ 명목의 안전계좌 송금, 현금 인출 후 전달, 또는 원격제어 앱 설치 요구가 이어질 가능성이 높습니다.",
  family: "상품권 구매·핀번호 전송, 대리 결제, 신분증 사진·인증번호 요구로 이어질 가능성이 높습니다.",
  loan: "기존 대출 상환금·보증료·수수료 명목의 송금 요구 또는 대출 앱 설치 요구가 이어질 가능성이 높습니다.",
  investment: "추가 입금 유도 후 ‘출금 수수료·세금’ 명목의 추가 송금 요구가 이어질 가능성이 높습니다.",
  smishing: "링크 접속 시 악성 앱 설치 → 문자·인증번호 탈취 → 소액결제·계좌 탈취로 이어질 수 있습니다.",
  job: "현금 수거·전달 또는 통장·체크카드 대여 요구로, 본인이 범죄 가담자(인출책)가 될 수 있습니다.",
  romance: "통관비·수수료·항공권 등 명목의 송금 요구가 이어질 가능성이 높습니다.",
};

const GENERIC_NEXT = "공식 경로로 확인되기 전까지 송금·인증번호·앱 설치 요청에는 응하지 마세요.";

export function buildFlow(items: EvidenceItem[], results: Map<string, ItemRuleResult>): RuleFlowResult {
  const edges: LinkEdge[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const ra = results.get(items[i].id)!;
      const rb = results.get(items[j].id)!;
      const e = scorePair(items[i], items[j], ra, rb);
      if (e.score > 0) edges.push(e);
    }
  }

  // Union-Find
  const parent = new Map<string, string>(items.map((it) => [it.id, it.id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const strong = edges.filter((e) => e.score >= LINK_THRESHOLD);
  for (const e of strong) parent.set(find(e.a), find(e.b));

  const groups = new Map<string, string[]>();
  for (const it of items) {
    const r = find(it.id);
    groups.set(r, [...(groups.get(r) ?? []), it.id]);
  }

  const byId = new Map(items.map((it, idx) => [it.id, { it, idx }]));
  const incidents: RuleIncident[] = [];
  const unlinked: string[] = [];
  let n = 1;

  for (const ids of groups.values()) {
    if (ids.length < 2) {
      unlinked.push(ids[0]);
      continue;
    }
    // 시간순 정렬 (시간 미입력 시 입력 순서)
    const sorted = [...ids].sort((x, y) => {
      const A = byId.get(x)!;
      const B = byId.get(y)!;
      const ta = Date.parse(A.it.occurredAt);
      const tb = Date.parse(B.it.occurredAt);
      if (!isNaN(ta) && !isNaN(tb) && ta !== tb) return ta - tb;
      return A.idx - B.idx;
    });
    const rs = sorted.map((id) => results.get(id)!);
    const scenCount = new Map<ScenarioId, number>();
    rs.forEach((r) =>
      r.signals.forEach((s) => s.scenario && scenCount.set(s.scenario, (scenCount.get(s.scenario) ?? 0) + s.weight)),
    );
    const scenario = [...scenCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const channels = Array.from(new Set(sorted.map((id) => byId.get(id)!.it.channel))) as Channel[];
    const stagesCovered = STAGE_ORDER.filter((st) => rs.some((r) => r.stage === st));
    const groupEdges = strong.filter((e) => ids.includes(e.a) && ids.includes(e.b));
    const shared = Array.from(new Set(groupEdges.flatMap((e) => e.reasons.filter((r) => r.startsWith("동일")))));
    const requestedActions = Array.from(new Set(rs.flatMap((r) => r.actions.map((a) => a.type)))) as ActionType[];

    const maxItem = Math.max(...rs.map((r) => r.score));
    let risk = maxItem + (channels.length - 1) * 8 + (stagesCovered.length - 1) * 5 + Math.min(10, (sorted.length - 2) * 3);
    // 단계가 시간 순으로 진행(접근→실행)되는지 확인
    const stageIdx = rs.map((r) => STAGE_ORDER.indexOf(r.stage));
    const progressing = stageIdx.every((v, i) => i === 0 || v >= stageIdx[i - 1]) && stageIdx[stageIdx.length - 1] > stageIdx[0];
    if (progressing) risk += 8;
    risk = Math.min(100, Math.round(risk));

    let pattern: string;
    if (progressing && stagesCovered.includes("execute")) {
      pattern = `전형적인 단계적 사기 흐름이 확인됩니다: ${stagesCovered.length}개 단계가 시간 순서대로 진행되어 ‘실행 요구’ 단계에 도달했습니다.`;
    } else if (stagesCovered.includes("execute")) {
      pattern = `서로 연결된 자료에서 금전·정보 제공 등 실행 요구가 확인됩니다.`;
    } else {
      pattern = `서로 연결된 자료가 아직 실행 요구 이전 단계에 있습니다. 다음 접촉에서 송금·정보 요구가 나올 수 있습니다.`;
    }
    if (channels.length > 1) pattern += ` (${channels.map((c) => CHANNEL_LABEL[c]).join(" → ")} 채널을 넘나드는 접근)`;

    incidents.push({
      id: `R${n++}`,
      itemIds: sorted,
      scenario,
      risk,
      level: levelOf(risk),
      channels,
      stagesCovered,
      edges: groupEdges,
      sharedEntities: shared,
      pattern,
      nextStep: scenario ? NEXT_STEP[scenario] : GENERIC_NEXT,
      requestedActions,
    });
  }

  incidents.sort((a, b) => b.risk - a.risk);
  return { incidents, unlinked, edges };
}

// AI 사건 묶음과 규칙 사건 묶음의 일치도 (쌍 단위 F1)
export function groupingAgreement(ruleGroups: string[][], aiGroups: string[][]): number | null {
  const pairs = (groups: string[][]) => {
    const s = new Set<string>();
    groups.forEach((g) => {
      const sorted = [...g].sort();
      for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) s.add(`${sorted[i]}|${sorted[j]}`);
    });
    return s;
  };
  const A = pairs(ruleGroups);
  const B = pairs(aiGroups);
  if (A.size === 0 && B.size === 0) return null;
  const inter = [...A].filter((p) => B.has(p)).length;
  const p = B.size ? inter / B.size : 0;
  const r = A.size ? inter / A.size : 0;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}
