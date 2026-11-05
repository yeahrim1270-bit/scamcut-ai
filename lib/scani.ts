// 스캔이(안내 캐릭터)의 단계별 안내 문구.
//
// 단계는 '실제 데이터'에서만 결정됩니다.
//  - analyzing : 분석이 실제로 진행 중일 때만 (analyzing 플래그를 넘겨받을 때)
//  - danger    : 저장된 분석 기록의 verdict 가 "danger" 일 때만
//  - caution   : 저장된 분석 기록의 verdict 가 "caution" 일 때만
//  - safe      : 저장된 분석 기록의 verdict 가 "safe" 일 때만
//  - idle      : 그 외 (현재 앱은 AI 분석이 연결되기 전이라 항상 이 단계)
// 따라서 분석이 연결되기 전에는 위험·안전 문구나 실시간 감지 알림이 나타나지 않습니다.

import type { AnalysisRecord } from "./models";

export type ScaniStage = "idle" | "analyzing" | "danger" | "caution" | "safe";

export interface ScaniLine {
  title: string;
  text: string;
}

export const SCANI_LINES: Record<Exclude<ScaniStage, "idle">, ScaniLine> = {
  analyzing: {
    title: "자료를 살펴보는 중이에요",
    text: "등록한 자료를 하나씩 확인하고 있어요. 잠시만 기다려 주세요.",
  },
  danger: {
    title: "위험 신호가 발견됐어요",
    text: "송금·인증번호 제공·링크 접속은 잠시 멈추고, 직접 찾은 공식 번호로 먼저 확인하세요.",
  },
  caution: {
    title: "주의가 필요한 표현이 있어요",
    text: "송금·인증번호·링크 요청이 있었는지 확인하고, 직접 찾은 공식 번호로 먼저 확인해 보세요.",
  },
  safe: {
    title: "확인된 위험 신호가 없어요",
    text: "그래도 낯선 요청은 공식 경로로 한 번 더 확인하는 게 안전해요.",
  },
};

export function idleLine(incidentCount: number, evidenceCount: number): ScaniLine {
  if (incidentCount === 0) {
    return { title: "안녕하세요, 스캔이예요!", text: "먼저 사건을 만들고, 의심스러운 문자·전화·이메일 자료를 모아 보세요." };
  }
  if (evidenceCount === 0) {
    return { title: "자료를 등록해 볼까요?", text: "사건에 문자·전화·이메일 자료를 추가하면 시간 순서대로 정리해 드려요." };
  }
  return { title: "분석할 준비가 됐어요", text: "분석할 사건을 고르면 결과를 보여 드릴 영역이 열려요. AI 분석은 다음 단계에서 연결돼요." };
}

// 사건별 가장 최근 분석 기록의 verdict 로 전체 단계를 결정합니다.
export function deriveStage(analyses: AnalysisRecord[], analyzing = false): ScaniStage {
  if (analyzing) return "analyzing";
  const latest = new Map<string, AnalysisRecord>();
  for (const a of analyses) {
    const cur = latest.get(a.incidentId);
    if (!cur || a.createdAt > cur.createdAt) latest.set(a.incidentId, a);
  }
  const verdicts = [...latest.values()].map((a) => a.verdict);
  if (verdicts.includes("danger")) return "danger";
  if (verdicts.includes("caution")) return "caution";
  if (verdicts.includes("safe")) return "safe";
  return "idle";
}

export function scaniLine(stage: ScaniStage, incidentCount: number, evidenceCount: number): ScaniLine {
  return stage === "idle" ? idleLine(incidentCount, evidenceCount) : SCANI_LINES[stage];
}
