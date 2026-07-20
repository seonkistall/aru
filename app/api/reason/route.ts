import { NextResponse } from "next/server";
import { reasonClean } from "@/lib/claim-filter";
import { parseReasonInput } from "@/lib/server/ai-input";
import { createRateLimiter, fetchWithTimeout, readBoundedJson, requestClientKey, RequestGuardError } from "@/lib/server/request-guard";

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
  ar: "아랍어(العربية)",
};

export async function POST(req: Request) {
  if (!reasonLimit(requestClientKey(req))) return NextResponse.json({ reasons: [], reason: "rate limited" }, { status: 429 });
  let body: unknown;
  try { body = await readBoundedJson(req, 32_768); }
  catch (error) {
    const status = error instanceof RequestGuardError ? error.status : 400;
    return NextResponse.json({ reasons: [], reason: status === 413 ? "request too large" : "invalid JSON" }, { status });
  }
  const parsed = parseReasonInput(body);
  if (!parsed.ok) return NextResponse.json({ reasons: [], reason: parsed.reason }, { status: 400 });
  const items = parsed.value.items as Item[];
  const lang = parsed.value.lang;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ reasons: items.map((item) => item.fallback), source: "template" });

  const langName = LANG_NAMES[lang ?? "ko"] ?? LANG_NAMES.ko;
  const sys =
    `너는 ARU의 스킨케어 안내 문구를 작성한다. 제공된 피부 타입, 고민, 예산, 제외 성분, 제품 정보만 바탕으로 각 제품을 살펴볼 이유를 정중하고 친근한 ${langName} 한 문장으로 쓴다. ` +
    "제공되지 않은 사실을 만들지 말고, 진단, 치료, 개선, 완화, 효능, 효과, 완벽, 보장 표현(각 언어의 동등한 표현 포함)은 사용하지 않는다. JSON 배열 형태로만 답한다.";

  const user = items
    .map(
      (item, i) =>
        `${i + 1}. ${item.brand} ${item.name} (${item.category}) / 피부 ${item.type} / 고민 ${
          item.matched.join("·") || "없음"
        } / 예산 ${item.budgetText} / 피하고 싶은 조건 반영 ${item.freeOf.join("·") || "없음"}`
    )
    .join("\n");

  try {
    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_REASON_MODEL ?? "gpt-5.6",
        temperature: 0.6,
        max_tokens: 256,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `${user}\n\n{"reasons": ["..."]} 형태로 답해.` },
        ],
      }),
    }, 15_000);
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

const reasonLimit = createRateLimiter({ max: 10, windowMs: 60_000, maxKeys: 10_000 });
