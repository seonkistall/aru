import { NextResponse } from "next/server";
import { reasonClean } from "@/lib/claim-filter";
import { clientIp, rateLimit, type RateBucket } from "@/lib/rate-limit";

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

const LANG_NAMES: Record<string, string> = {
  ko: "한국어",
  en: "영어(English)",
  ja: "일본어(日本語)",
  zh: "중국어 간체(简体中文)",
};

// Public endpoint that calls the paid OpenAI chat model — cap per IP, and cap
// the items array so the prompt cost can't scale with attacker input (the real
// client sends 3 picks).
const rate = new Map<string, RateBucket>();
const MAX_ITEMS = 12;

export async function POST(req: Request) {
  if (!rateLimit(rate, clientIp(req), { max: 30 })) {
    return NextResponse.json({ reasons: [], source: "rate-limited" }, { status: 429 });
  }
  let items: Item[];
  let lang: string | undefined;
  try {
    ({ items, lang } = (await req.json()) as { items: Item[]; lang?: string });
  } catch {
    return NextResponse.json({ reasons: [], source: "bad-request" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
    return NextResponse.json({ reasons: [], source: "bad-request" }, { status: 400 });
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ reasons: items.map((item) => item.fallback), source: "template" });

  const langName = LANG_NAMES[lang ?? "ko"] ?? LANG_NAMES.ko;
  const sys =
    `너는 화장품 추천 카피라이터다. 제품이 왜 사용자 조건에 맞는지 반드시 ${langName}로 1문장씩 쓴다. ` +
    "진단, 치료, 개선, 완화, 효능, 효과, 보장 표현(각 언어의 동등한 표현 포함)은 금지한다. JSON 배열 형태로만 답한다.";

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
      return candidate && reasonClean(candidate, lang ?? "ko") ? candidate : item.fallback;
    });
    return NextResponse.json({ reasons, source: "llm" });
  } catch {
    return NextResponse.json({ reasons: items.map((item) => item.fallback), source: "template" });
  }
}
