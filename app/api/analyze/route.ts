import { NextResponse } from "next/server";
import { efficacyClean } from "@/lib/recommend";

const OIL = ["거의 없음", "조금 있음", "많은 편"] as const;
const REDNESS = ["거의 없음", "약간 보임", "붉은기 있음"] as const;
const PORES = ["매끈한 편", "조금 도드라짐", "도드라진 편"] as const;

const SYS =
  "너는 피부 미용 관찰 보조자다. 사진에서 보이는 특징만 정성적으로 고른다. " +
  "진단, 치료, 효능, 개선, 수치 표현은 금지한다. " +
  'JSON으로만 {"oil":"...","redness":"...","pores":"...","narrative":"..."} 형태로 답한다.';

const USER =
  `유분 선택지: ${OIL.join(" / ")}\n` +
  `붉은기 선택지: ${REDNESS.join(" / ")}\n` +
  `모공/결 선택지: ${PORES.join(" / ")}\n` +
  "각 항목에서 하나씩 고르고, 마지막에 한국어로 1문장 관찰 설명을 쓴다.";

async function callGemini(image: string): Promise<Record<string, unknown> | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const b64 = image.split(",")[1] ?? "";
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${SYS}\n\n${USER}` }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
    }),
  });
  if (!response.ok) throw new Error(`gemini ${response.status}`);
  const json = await response.json();
  return JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
}

async function callOpenAI(image: string): Promise<Record<string, unknown> | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
  if (!response.ok) throw new Error(`openai ${response.status}`);
  const json = await response.json();
  return JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
}

export async function POST(req: Request) {
  const { image } = (await req.json()) as { image: string };
  if (!image?.startsWith("data:image")) return NextResponse.json({ ok: false }, { status: 400 });

  const provider = process.env.VISION_PROVIDER ?? "gemini";
  try {
    const payload = provider === "openai" ? await callOpenAI(image) : await callGemini(image);
    if (!payload) return NextResponse.json({ ok: false, reason: "no key" }, { status: 503 });

    const pick = <T extends readonly string[]>(value: unknown, opts: T) =>
      typeof value === "string" && opts.includes(value) ? value : null;

    const oil = pick(payload.oil, OIL);
    const redness = pick(payload.redness, REDNESS);
    const pores = pick(payload.pores, PORES);
    if (!oil || !redness || !pores) throw new Error("bad shape");

    const narrative =
      typeof payload.narrative === "string" && efficacyClean(payload.narrative).ok ? payload.narrative : "";

    return NextResponse.json({ ok: true, oil, redness, pores, narrative, source: provider });
  } catch {
    return NextResponse.json({ ok: false, reason: "vision failed" }, { status: 502 });
  }
}
