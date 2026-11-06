// OpenAI(gpt-5-mini) 사건 해석 API — 서버에서만 호출합니다.
//  - 키는 서버 환경변수 OPENAI_API_KEY(.env.local)에서만 읽고, 브라우저로 내려보내지 않습니다.
//  - 자료는 전송 전에 개인정보(전화·계좌·주민번호·카드·인증번호 등)를 가립니다.
//  - OpenAI 쪽 저장(store)은 끕니다. 서버도 자료를 저장하거나 로그에 남기지 않습니다.
//  - 모델이 인용한 근거 문장은 원문에 실제로 있는지 서버에서 다시 확인합니다.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { maskItems } from "@/lib/privacy";
import type { EvidenceItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const MAX_ITEMS = 15;
const MAX_CONTENT = 3000;

const Stage = z.enum(["contact", "trust", "pressure", "execute"]);

const FlowSchema = z.object({
  risk_level: z.enum(["low", "caution", "high"]),
  headline: z.string(),
  is_linked: z.boolean(),
  scam_type: z.string(),
  narrative: z.string(),
  timeline: z.array(z.object({ item: z.string(), stage: Stage, description: z.string() })),
  link_reasons: z.array(z.string()),
  suspicious_points: z.array(z.object({ item: z.string(), quote: z.string(), reason: z.string() })),
  predicted_next_step: z.string(),
  safe_actions: z.array(z.object({ priority: z.number(), action: z.string(), reason: z.string() })),
  verify_targets: z.array(z.object({ claimed_identity: z.string(), how_to_verify: z.string() })),
});

const SYSTEM = `당신은 한국 금융사기(보이스피싱·스미싱·가족 사칭·투자/대출 사기) 분석을 돕는 보조 분석가입니다.
사용자가 같은 사건으로 모은 문자·전화(통화 내용 메모)·이메일 자료가 <item id="E1" ...> 형식으로 주어집니다.

규칙
- 사기를 '확정'하지 마세요. "의심 징후", "~할 가능성이 있어요" 처럼 표현하고, 근거가 약하면 risk_level 을 낮게 두세요.
- 정상적인 안내(배송 예정, 승인 알림, 인증번호 발송 문자, 보안 경고 문구, 일상 대화)는 low 로 판단하고 억지로 위험 요소를 만들지 마세요.
- 자료들이 서로 이어지는지(같은 사칭 대상·번호·계좌·링크·말투, 앞 자료에서 예고한 연락의 이행, 단계적 진행)를 판단해 is_linked 에 반영하세요. 같은 유형이라는 이유만으로 무관한 자료를 묶지 마세요.
- timeline 의 stage: contact(접근) / trust(신뢰 형성·사칭) / pressure(긴급·위협·비밀 유지 압박) / execute(송금·정보·앱 설치 등 실행 요구). item 은 "E1" 같은 자료 id 입니다. 시간순으로 쓰세요.
- suspicious_points 의 quote 는 해당 자료 원문에서 그대로 복사한 짧은 구절이어야 합니다(바꿔 쓰지 마세요). 근거 구절이 없으면 항목을 만들지 마세요.
- safe_actions 는 지금 사용자가 할 일을 priority 1(가장 급함)부터 쓰세요. 자료에 적힌 번호·링크로 연락하라고 하지 말고, 직접 찾은 공식 번호나 공식 앱으로 확인하라고 안내하세요. 이미 피해가 있을 수 있는 경우 112, 금융감독원 1332, 118 안내를 포함하세요.
- verify_targets: 자료에서 상대가 주장한 신원과 그 신원을 공식 경로로 확인하는 방법.
- [전화#1], [계좌#2] 같은 토큰은 개인정보 보호를 위해 가려진 값입니다. 같은 토큰은 같은 원본 값이므로 연결 근거로 쓸 수 있습니다.
- 모든 텍스트는 쉬운 한국어로 쓰세요.`;

// ---- 간단한 요청 제한(키 보호): IP 당 분당 8회
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 8;
}

const squash = (s: string) => s.replace(/\s+/g, "");

export async function GET() {
  // 키 값은 절대 반환하지 않고 사용 가능 여부만 알려 줍니다.
  return Response.json({ available: !!process.env.OPENAI_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "서버에 OPENAI_API_KEY 가 설정되지 않았습니다." }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) {
    return Response.json({ ok: false, error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = (await req.json()).items;
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return Response.json({ ok: false, error: "분석할 자료가 없습니다." }, { status: 400 });
  }
  if (raw.length > MAX_ITEMS) {
    return Response.json({ ok: false, error: `한 번에 최대 ${MAX_ITEMS}개 자료까지 분석할 수 있어요.` }, { status: 400 });
  }
  const items: EvidenceItem[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r.content !== "string" || !r.content.trim() || typeof r.id !== "string" || !/^E\d{1,2}$/.test(r.id)) {
      return Response.json({ ok: false, error: "자료 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (r.content.length > MAX_CONTENT) {
      return Response.json({ ok: false, error: `자료 ${r.id} 의 길이가 ${MAX_CONTENT}자를 넘어요.` }, { status: 400 });
    }
    const ch = r.channel === "call" || r.channel === "email" ? r.channel : "sms";
    items.push({ id: r.id, channel: ch, sender: String(r.sender ?? "").slice(0, 120), occurredAt: String(r.occurredAt ?? "").slice(0, 32), content: r.content });
  }

  // 서버에서도 한 번 더 마스킹(클라이언트가 이미 가렸더라도 안전하게)
  const { masked, report } = maskItems(items);
  const chName = { sms: "문자", call: "전화(통화 내용 메모)", email: "이메일" } as const;
  const input = masked
    .map((m) => `<item id="${m.id}" channel="${chName[m.channel]}" sender="${(m.sender || "미상").replace(/"/g, "'")}" time="${m.occurredAt || "미상"}">\n${m.content}\n</item>`)
    .join("\n\n");

  const client = new OpenAI({ apiKey, timeout: 55_000, maxRetries: 1 });
  const started = Date.now();
  try {
    const resp = await client.responses.parse({
      model: MODEL,
      instructions: SYSTEM,
      input: `다음 자료를 분석하세요.\n\n${input}`,
      reasoning: { effort: "low" },
      text: { format: zodTextFormat(FlowSchema, "scam_flow") },
      max_output_tokens: 6000,
      store: false,
    });

    const result = resp.output_parsed;
    if (!result) {
      const why = resp.status === "incomplete" ? "응답이 길어 중간에 끊겼어요. 자료 수를 줄여 다시 시도해 주세요." : "AI가 올바른 형식으로 답하지 못했어요. 다시 시도해 주세요.";
      return Response.json({ ok: false, error: why }, { status: 502 });
    }

    // 근거 구절 검증: 원문에 실제로 있는 구절만 인용으로 인정
    const byId = new Map(masked.map((m) => [m.id, squash(m.content)]));
    const points = result.suspicious_points.map((p) => {
      const text = byId.get(p.item);
      const verified = !!text && p.quote.trim().length >= 2 && text.includes(squash(p.quote));
      return { ...p, quote_verified: verified };
    });
    const knownIds = new Set(masked.map((m) => m.id));
    return Response.json({
      ok: true,
      model: resp.model,
      result: {
        ...result,
        suspicious_points: points,
        timeline: result.timeline.filter((t) => knownIds.has(t.item)),
      },
      maskedCounts: report,
      usage: resp.usage ? { input: resp.usage.input_tokens, output: resp.usage.output_tokens } : null,
      elapsedMs: Date.now() - started,
    });
  } catch (err) {
    // 요청 내용(개인정보)은 기록하지 않고 오류 종류만 남깁니다.
    console.error("OpenAI error:", err instanceof Error ? err.constructor.name : "unknown", (err as { status?: number })?.status);
    if (err instanceof OpenAI.AuthenticationError) return Response.json({ ok: false, error: "OpenAI API 키가 올바르지 않거나 만료되었어요." }, { status: 502 });
    if (err instanceof OpenAI.RateLimitError) return Response.json({ ok: false, error: "OpenAI 사용 한도에 걸렸어요. 잠시 후 다시 시도하거나 결제·한도를 확인해 주세요." }, { status: 429 });
    if (err instanceof OpenAI.NotFoundError) return Response.json({ ok: false, error: `모델(${MODEL})을 사용할 수 없어요. 모델 이름과 계정 권한을 확인해 주세요.` }, { status: 502 });
    if (err instanceof OpenAI.APIConnectionTimeoutError) return Response.json({ ok: false, error: "AI 응답이 너무 오래 걸려요. 다시 시도해 주세요." }, { status: 504 });
    if (err instanceof OpenAI.APIConnectionError) return Response.json({ ok: false, error: "OpenAI 서버에 연결할 수 없어요." }, { status: 502 });
    if (err instanceof OpenAI.APIError) return Response.json({ ok: false, error: `AI 분석 오류 (${err.status ?? "?"})` }, { status: 502 });
    return Response.json({ ok: false, error: "알 수 없는 오류가 발생했어요." }, { status: 500 });
  }
}
