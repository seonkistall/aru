import { NextResponse } from "next/server";
import { efficacyClean } from "@/lib/recommend";

type Item = {
  brand: string;
  name: string;
  category: string;
  type: string;
  matched: string[];
  budgetText: string;
  freeOf: string[];
  fallback: string;
};

export async function POST(req: Request) {
  const { items } = (await req.json()) as { items: Item[] };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ reasons: items.map((item) => item.fallback), source: "template" });

  const sys =
    "너는 한국어 화장품 추천 카피라이터다. 제품이 왜 사용자 조건에 맞는지 1문장으로 쓴다. " +
    "진단, 치료, 개선, 완화, 효능, 효과, 보장 표현은 금지한다. JSON 배열 형태로만 답한다.";

  const user = items
    .map(
      (item, i) =>
        `${i + 1}. ${item.brand} ${item.name} (${item.category}) / 피부 ${item.type} / 고민 ${
          item.matched.join("·") || "없음"
        } / 예산 ${item.budgetText} / 피하고 싶은 조건 반영 ${item.freeOf.join("·") || "없음"}`
    )
    .join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `${user}\n\n{"reasons": ["..."]} 형태로 답해.` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`openai ${response.status}`);
    const json = await response.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    const out: string[] = Array.isArray(parsed.reasons) ? parsed.reasons : [];
    const reasons = items.map((item, i) => {
      const candidate = typeof out[i] === "string" ? out[i].trim() : "";
      return candidate && efficacyClean(candidate).ok ? candidate : item.fallback;
    });
    return NextResponse.json({ reasons, source: "llm" });
  } catch {
    return NextResponse.json({ reasons: items.map((item) => item.fallback), source: "template" });
  }
}
