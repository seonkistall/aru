import { NextResponse } from "next/server";
import { efficacyClean } from "@/lib/recommend";

/**
 * Vision skin analysis. Provider-swappable via VISION_PROVIDER:
 *   "gemini" (free tier, AI Studio key) — test/deploy. ⚠ free tier may use uploads
 *            to improve Google's models; fine for a throwaway test, not real users.
 *   "openai" (gpt-4o-mini) — ~0.3원/scan, does NOT train on data. The production path (B).
 *
 * Takes a FACE CROP (consent-gated, processed then discarded — never stored, D3).
 * Qualitative only (no fabricated 수분%); narrative passes the efficacy guardrail.
 */

const OIL = ["거의 없음", "살짝 있음", "있는 편"];
const REDNESS = ["거의 없음", "약간 보임", "붉은기 있음"];
const PORES = ["매끈한 편", "신경 쓰이는 정도", "도드라짐"];

const SYS =
  "너는 피부 미용(비의료) 관찰자다. 셀피 크롭을 보고 보이는 것만 정성으로 판독한다. " +
  "정량 수치(수분%, 나이) 금지. 효능/의학 표현(미백·개선·완화·치료·재생) 금지. " +
  "각 항목은 주어진 보기 중에서만 고른다. 마지막에 1~2문장 한국어 내러티브(따뜻·정직, 보이는 특징만). " +
  'JSON으로만: {"oil":"...","redness":"...","pores":"...","narrative":"..."}';
const USER =
  `유분 보기: ${OIL.join(" / ")}\n붉은기 보기: ${REDNESS.join(" / ")}\n모공/결 보기: ${PORES.join(" / ")}\n` +
  "이 셀피를 보고 위 보기에서 각각 하나씩 고르고 내러티브를 써라.";

async function callGemini(image: string): Promise<Record<string, unknown> | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const b64 = image.split(",")[1] ?? "";
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${SYS}\n\n${USER}` }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
    }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const j = await r.json();
  return JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
}

async function callOpenAI(image: string): Promise<Record<string, unknown> | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: [{ type: "text", text: USER }, { type: "image_url", image_url: { url: image, detail: "low" } }] },
      ],
    }),
  });
  if (!r.ok) throw new Error(`openai ${r.status}`);
  const j = await r.json();
  return JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
}

export async function POST(req: Request) {
  const { image } = (await req.json()) as { image: string };
  if (!image?.startsWith("data:image")) return NextResponse.json({ ok: false }, { status: 400 });

  const provider = process.env.VISION_PROVIDER ?? "gemini";
  try {
    const p = provider === "openai" ? await callOpenAI(image) : await callGemini(image);
    if (!p) return NextResponse.json({ ok: false, reason: "no key" }, { status: 503 });

    const pick = (v: unknown, opts: string[]) => (typeof v === "string" && opts.includes(v) ? v : null);
    const oil = pick(p.oil, OIL);
    const redness = pick(p.redness, REDNESS);
    const pores = pick(p.pores, PORES);
    if (!oil || !redness || !pores) throw new Error("bad shape");
    const narrative = typeof p.narrative === "string" && efficacyClean(p.narrative).ok ? p.narrative : "";
    return NextResponse.json({ ok: true, oil, redness, pores, narrative, source: provider });
  } catch {
    return NextResponse.json({ ok: false, reason: "vision failed" }, { status: 502 });
  }
}
