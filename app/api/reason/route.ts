import { NextResponse } from "next/server";
import { efficacyClean } from "@/lib/recommend";

/**
 * ① LLM reason naturalization (D4-A): natural FIT copy, grounded in match tags,
 * with the efficacy guardrail applied to the OUTPUT. Falls back to the caller's
 * deterministic template when no key / error / a banned word slips through.
 *
 * Provider-agnostic via OPENAI_API_KEY (Anthropic works the same with a swap).
 * No SDK — plain fetch keeps deps light.
 */

type Item = {
  brand: string;
  name: string;
  category: string;
  type: string; // 피부 타입
  matched: string[]; // matched concerns
  budgetText: string;
  freeOf: string[];
  fallback: string; // the template reason to return if LLM unavailable
};

export async function POST(req: Request) {
  const { items } = (await req.json()) as { items: Item[] };
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // graceful fallback — the product still works without an LLM
    return NextResponse.json({ reasons: items.map((i) => i.fallback), source: "template" });
  }

  const sys =
    "너는 한국 화장품 추천 카피라이터다. 각 제품마다 '왜 이 사람에게 맞는지'를 1문장(40자 내외) 한국어로 써라. " +
    "반드시 적합성만 말한다: 피부 타입·고민·예산·성분 매칭. " +
    "효능/의학 표현은 절대 금지: 미백, 개선, 완화, 치료, 재생, 항노화, 흉터/트러블 제거 등. " +
    "광고가 아니라 솔직한 큐레이터 톤. JSON 배열(문자열들)로만 답하라.";

  const user = items
    .map(
      (i, n) =>
        `${n + 1}. ${i.brand} ${i.name} (${i.category}) — 타깃: ${i.type} 피부, 고민 ${i.matched.join("·") || "없음"}, 예산 ${i.budgetText}, 무첨가 ${i.freeOf.join("·") || "없음"}`
    )
    .join("\n");

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `${user}\n\n{"reasons": [...]} 형태로.` },
        ],
      }),
    });
    if (!r.ok) throw new Error(`openai ${r.status}`);
    const j = await r.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    const out: string[] = Array.isArray(parsed.reasons) ? parsed.reasons : [];
    // guardrail per item: any efficacy slip → use the template fallback.
    const reasons = items.map((it, n) => {
      const cand = typeof out[n] === "string" ? out[n].trim() : "";
      return cand && efficacyClean(cand).ok ? cand : it.fallback;
    });
    return NextResponse.json({ reasons, source: "llm" });
  } catch {
    return NextResponse.json({ reasons: items.map((i) => i.fallback), source: "template" });
  }
}
