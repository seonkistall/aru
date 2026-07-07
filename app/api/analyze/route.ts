import { NextResponse } from "next/server";
import { efficacyClean } from "@/lib/recommend";
import { SKIN_LABELS, type SkinAttr, type SkinLevel } from "@/lib/skin";
import { openAiVisionUserContent } from "@/lib/vision-payload";

const ATTRS = ["oil", "redness", "pores"] as const satisfies readonly SkinAttr[];

const SYS =
  "너는 피부 미용 관찰 보조자다. 사진에서 보이는 특징만 정성적으로 고른다. " +
  "진단, 치료, 효능, 개선, 수치 표현은 금지한다. " +
  'JSON으로만 {"labels":{"oil":0,"redness":0,"pores":0},"confidence":{"oil":0.7,"redness":0.7,"pores":0.7},"narrative":"..."} 형태로 답한다.';

const USER =
  `oil 선택지: 0=${SKIN_LABELS.oil[0]} / 1=${SKIN_LABELS.oil[1]} / 2=${SKIN_LABELS.oil[2]}\n` +
  `redness 선택지: 0=${SKIN_LABELS.redness[0]} / 1=${SKIN_LABELS.redness[1]} / 2=${SKIN_LABELS.redness[2]}\n` +
  `pores 선택지: 0=${SKIN_LABELS.pores[0]} / 1=${SKIN_LABELS.pores[1]} / 2=${SKIN_LABELS.pores[2]}\n` +
  "각 항목은 0, 1, 2 중 하나만 고른다. confidence는 0.0~1.0 사이로 쓰고, 마지막에 한국어로 1문장 관찰 설명을 쓴다.";

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
        { role: "user", content: openAiVisionUserContent(USER, image) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`openai ${response.status}`);
  const json = await response.json();
  return JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
}

export async function POST(req: Request) {
  let image: string | undefined;
  try {
    ({ image } = (await req.json()) as { image: string });
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid JSON" }, { status: 400 });
  }
  if (!image?.startsWith("data:image")) return NextResponse.json({ ok: false }, { status: 400 });

  const provider = process.env.VISION_PROVIDER ?? "gemini";
  try {
    const payload = provider === "openai" ? await callOpenAI(image) : await callGemini(image);
    if (!payload) return NextResponse.json({ ok: false, reason: "no key" }, { status: 503 });

    const labels = readLabels(payload);
    const confidence = readConfidence(payload);
    if (!labels) throw new Error("bad shape");

    const narrative =
      typeof payload.narrative === "string" && efficacyClean(payload.narrative).ok ? payload.narrative : "";

    return NextResponse.json({ ok: true, labels, confidence, narrative, source: provider });
  } catch {
    return NextResponse.json({ ok: false, reason: "vision failed" }, { status: 502 });
  }
}

function readLabels(payload: Record<string, unknown>): Record<SkinAttr, SkinLevel> | null {
  const src = typeof payload.labels === "object" && payload.labels ? payload.labels as Record<string, unknown> : payload;
  const out = {} as Record<SkinAttr, SkinLevel>;
  for (const attr of ATTRS) {
    const value = src[attr];
    if (value !== 0 && value !== 1 && value !== 2) return null;
    out[attr] = value;
  }
  return out;
}

function readConfidence(payload: Record<string, unknown>): Partial<Record<SkinAttr, number>> {
  const src = typeof payload.confidence === "object" && payload.confidence ? payload.confidence as Record<string, unknown> : {};
  const out: Partial<Record<SkinAttr, number>> = {};
  for (const attr of ATTRS) {
    const value = src[attr];
    if (typeof value === "number" && Number.isFinite(value)) out[attr] = Math.max(0, Math.min(1, value));
  }
  return out;
}
