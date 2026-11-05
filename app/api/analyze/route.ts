// AI 분석 API — Claude가 (마스킹된) 자료를 읽고 위험 징후, 사건 연결, 위험 행동을 분석합니다.
// - 입력은 브라우저에서 이미 개인정보 마스킹을 거친 텍스트입니다.
// - 서버는 어떤 자료도 저장하지 않습니다 (로그에 본문을 남기지 않음).

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.SCAMCUT_EFFORT as "low" | "medium" | "high") || "low";

const RiskLevel = z.enum(["low", "watch", "caution", "danger"]);
const ActionType = z.enum(["TRANSFER", "OTP", "PERSONAL_INFO", "LINK", "APP_INSTALL", "CASH", "GIFT_CARD"]);
const Stage = z.enum(["contact", "trust", "pressure", "execute"]);

const ResultSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      risk_score: z.number().describe("0~100"),
      risk_level: RiskLevel,
      scam_type: z.string().describe("추정 사기 유형(한국어). 정상이면 '정상 메시지'"),
      signals: z.array(
        z.object({
          label: z.string(),
          evidence: z.string().describe("원문에서 그대로 인용한 근거 구절"),
          explanation: z.string(),
        }),
      ),
      risky_actions: z.array(
        z.object({ type: ActionType, evidence: z.string(), why_dangerous: z.string() }),
      ),
      summary: z.string(),
    }),
  ),
  incidents: z.array(
    z.object({
      title: z.string(),
      scam_type: z.string(),
      item_ids: z.array(z.string()),
      confidence: z.number().describe("0~100, 이 자료들이 같은 사건이라는 확신도"),
      link_reasons: z.array(z.string()),
      timeline: z.array(z.object({ item_id: z.string(), stage: Stage, description: z.string() })),
      narrative: z.string(),
      predicted_next_step: z.string(),
      overall_risk_score: z.number(),
      overall_risk_level: RiskLevel,
    }),
  ),
  unlinked_item_ids: z.array(z.string()),
  safe_actions: z.array(z.object({ priority: z.number(), action: z.string(), reason: z.string() })),
  verify_targets: z.array(z.object({ claimed_identity: z.string(), how_to_verify: z.string() })),
});

const SYSTEM = `당신은 한국 금융사기(보이스피싱·스미싱·메신저 피싱·투자/대출 사기) 분석 전문가입니다.
사용자가 문자·전화 메모·이메일 등 여러 자료를 제출합니다. 각 자료는 ID(E1, E2...), 채널, 발신자, 시각, 본문을 가집니다.

분석 목표:
1. items: 각 자료의 위험 징후와 위험도를 독립적으로 평가합니다. 근거(evidence)는 반드시 원문 구절을 인용하세요. 정상 메시지는 낮은 점수를 주고 억지로 위험 징후를 만들지 마세요.
2. incidents (가장 중요): 서로 다른 자료들이 하나의 사기 사건으로 연결되는지 판단합니다.
   - 연결 근거 예: 같은 번호/계좌/도메인/인물/직함, 앞 자료에서 예고한 연락이 다음 자료에서 이어짐, 시나리오의 논리적 연속(기관 사칭 문자 → 통화 → 이메일로 송금 요구), 시간 근접성.
   - 같은 사기 유형이라는 이유만으로 무관한 자료를 묶지 마세요. 2개 이상 자료가 실제로 이어질 때만 사건으로 만드세요.
   - timeline은 시간순으로, 단계(stage)는 contact(접근) / trust(신뢰 형성·사칭) / pressure(위협·긴급·비밀 유지 압박) / execute(송금·정보·앱 설치 등 실행 요구) 중에서 고릅니다.
   - narrative는 사기범의 의도와 흐름을 일반인이 이해할 수 있게 3~5문장으로 설명합니다.
   - predicted_next_step은 이 흐름에서 사기범이 다음에 요구할 가능성이 높은 행동입니다.
3. unlinked_item_ids: 어떤 사건에도 속하지 않는 자료 ID.
4. risky_actions: 송금(TRANSFER), 인증번호(OTP), 개인정보(PERSONAL_INFO), 링크 접속(LINK), 앱 설치·원격제어(APP_INSTALL), 현금 인출·전달(CASH), 상품권(GIFT_CARD) 요구를 탐지합니다.
5. safe_actions: 지금 사용자가 해야 할 안전 행동을 우선순위(1이 가장 급함)로 제시합니다. 공식 번호(112, 1332, 118)나 기관 대표번호를 직접 확인하라는 식으로 안내하고, 자료에 등장한 번호·링크로 연락하라고 안내하지 마세요.
6. verify_targets: 자료에서 상대가 주장한 신원(예: 서울중앙지검 수사관, 딸)과 그 신원을 공식 경로로 확인하는 방법.

주의: [전화#1], [계좌#2] 같은 토큰은 개인정보 보호를 위해 마스킹된 값입니다. 같은 토큰은 같은 원본 값을 의미하므로 연결 근거로 활용하세요.
모든 텍스트는 한국어로 작성하세요.`;

interface InItem {
  id: string;
  channel: string;
  sender: string;
  occurredAt: string;
  content: string;
}

function hasCredentials() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function GET() {
  return Response.json({ aiAvailable: hasCredentials(), model: MODEL });
}

export async function POST(req: Request) {
  if (!hasCredentials()) {
    return Response.json(
      { ok: false, error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다. 규칙 기반 분석만 사용할 수 있습니다." },
      { status: 503 },
    );
  }

  let items: InItem[];
  try {
    const body = await req.json();
    items = (body.items ?? []) as InItem[];
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ ok: false, error: "분석할 자료가 없습니다." }, { status: 400 });
  }
  if (items.length > 15) {
    return Response.json({ ok: false, error: "한 번에 최대 15개 자료까지 분석할 수 있습니다." }, { status: 400 });
  }
  const tooLong = items.find((it) => typeof it.content !== "string" || it.content.length > 3000);
  if (tooLong) {
    return Response.json({ ok: false, error: `자료 ${tooLong.id}의 길이가 3,000자를 넘습니다. 핵심 부분만 입력해 주세요.` }, { status: 400 });
  }

  const channelName: Record<string, string> = { sms: "문자", call: "전화(통화 내용 메모)", email: "이메일" };
  const userText = items
    .map(
      (it) =>
        `<item id="${it.id}" channel="${channelName[it.channel] ?? it.channel}" sender="${(it.sender || "미상").replace(/"/g, "'")}" time="${it.occurredAt || "미상"}">\n${it.content}\n</item>`,
    )
    .join("\n\n");

  const client = new Anthropic();
  const started = Date.now();
  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: EFFORT, format: zodOutputFormat(ResultSchema) },
      messages: [{ role: "user", content: `다음 자료들을 분석하세요.\n\n${userText}` }],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ ok: false, error: "AI가 이 요청의 분석을 거절했습니다. 규칙 기반 결과를 참고하세요." }, { status: 422 });
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return Response.json({ ok: false, error: "AI 응답이 불완전합니다. 자료 수를 줄여 다시 시도하세요." }, { status: 502 });
    }

    const r = response.parsed_output;
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    r.items.forEach((i) => (i.risk_score = clamp(i.risk_score)));
    r.incidents.forEach((i) => {
      i.overall_risk_score = clamp(i.overall_risk_score);
      i.confidence = clamp(i.confidence);
    });

    return Response.json({ ok: true, model: response.model, result: r, elapsedMs: Date.now() - started });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ ok: false, error: "API 키가 올바르지 않습니다." }, { status: 401 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ ok: false, error: "요청이 많아 잠시 후 다시 시도해 주세요." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return Response.json({ ok: false, error: "AI 서버에 연결할 수 없습니다." }, { status: 502 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      return Response.json({ ok: false, error: `AI 분석 오류 (${err.status ?? "?"})` }, { status: 502 });
    }
    console.error("Unexpected error", (err as Error).message);
    return Response.json({ ok: false, error: "알 수 없는 오류가 발생했습니다." }, { status: 500 });
  }
}
