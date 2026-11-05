// 규칙 엔진 · 사건 연결 · 마스킹 동작 검증 (npm run test:rules)
import { analyzeItem } from "../lib/rules";
import { buildFlow } from "../lib/flow";
import { maskItems } from "../lib/privacy";
import { SAMPLE_SETS } from "../lib/samples";

let fail = 0;
const check = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) fail++; };

for (const set of SAMPLE_SETS) {
  const items = set.items.map((it, i) => ({ ...it, id: `E${i + 1}` }));
  const rules = new Map(items.map((it) => [it.id, analyzeItem(it)]));
  const flow = buildFlow(items, rules);
  console.log(`\n== ${set.name}`);
  for (const [id, r] of rules) console.log(`  ${id} score=${r.score} stage=${r.stage} actions=${r.actions.map(a=>a.type)} ent=${JSON.stringify(r.entities)}`);
  for (const inc of flow.incidents) console.log(`  incident ${inc.id}: ${inc.itemIds} risk=${inc.risk} scen=${inc.scenario}`);
  for (const e of flow.edges) console.log(`  edge ${e.a}-${e.b} ${e.score} ${e.reasons.join(" / ")}`);
  console.log("  masked:", maskItems(items).masked.map((m) => m.content).join("\n          "));
}

// 기대 동작
{
  const s = SAMPLE_SETS[0].items.map((it, i) => ({ ...it, id: `E${i + 1}` }));
  const rules = new Map(s.map((it) => [it.id, analyzeItem(it)]));
  const flow = buildFlow(s, rules);
  check(flow.incidents.length === 1 && flow.incidents[0].itemIds.join() === "E1,E2,E3", "기관사칭: E1~E3 한 사건, 택배(E4) 제외");
  check(rules.get("E4")!.score < 15, "정상 택배 문자는 낮은 위험도");
  check(rules.get("E3")!.actions.some((a) => a.type === "TRANSFER") && rules.get("E3")!.actions.some((a) => a.type === "OTP"), "E3 송금·인증번호 요구 탐지");
}
{
  const s = SAMPLE_SETS[1].items.map((it, i) => ({ ...it, id: `E${i + 1}` }));
  const rules = new Map(s.map((it) => [it.id, analyzeItem(it)]));
  const flow = buildFlow(s, rules);
  check(flow.incidents.length === 1 && flow.incidents[0].itemIds.length === 3, "가족사칭: 3개 자료 한 사건");
  check(flow.incidents[0].scenario === "family", "가족사칭 시나리오 분류");
}
{
  const { masked } = maskItems([{ id: "E1", channel: "sms", sender: "010-1111-2222", occurredAt: "", content: "주민번호 900101-1234567 계좌 110-123-456789 인증번호 482913 그리고 010 1111 2222" }]);
  const c = masked[0].content;
  check(!/900101|456789|482913|1111/.test(c + masked[0].sender), "민감정보 원문 미노출");
  check(masked[0].sender === "[전화#1]" && c.includes("[전화#1]"), "같은 번호는 같은 토큰으로 치환");
}
{
  const r = analyzeItem({ id: "E1", channel: "sms", sender: "", occurredAt: "", content: "내일 점심 12시에 강남역에서 봐요!" });
  check(r.score < 15, "일상 대화는 낮은 위험도");
}
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
