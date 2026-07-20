// Verify that OPENAI_API_KEY works and that OPENAI_REASON_MODEL is a model id
// this account can actually call, before the key is registered on Vercel.
// Reads .env.local, prints status only — never the key.
//   npm run openai:check
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) out[match[1]] = match[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...readEnvLocal(), ...process.env };
const key = env.OPENAI_API_KEY;
const model = env.OPENAI_REASON_MODEL || "gpt-5.6-luna";

if (!key) {
  console.error("OPENAI_API_KEY is not set in .env.local or the environment.");
  console.error("Add it to .env.local (never commit it) and run this again.");
  process.exit(1);
}

console.log(`model under test: ${model}`);

const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  body: JSON.stringify({
    model,
    max_completion_tokens: 32,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Reply with JSON only." },
      { role: "user", content: 'Reply exactly {"ok": true}.' },
    ],
  }),
});

if (response.ok) {
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content ?? "";
  console.log(`HTTP ${response.status} — model reachable`);
  console.log(`response: ${content.slice(0, 120)}`);
  console.log(`billed model: ${json.model ?? "(not reported)"}`);
  console.log("\nOK. Register this same key as OPENAI_API_KEY on Vercel (Production, Sensitive),");
  console.log("redeploy, then confirm POST /api/reason returns \"source\": \"llm\".");
  process.exit(0);
}

const detail = await response.text();
console.error(`HTTP ${response.status} — call failed`);
console.error(detail.slice(0, 400));

if (response.status === 400 || response.status === 404) {
  console.error("\nThat usually means the model id is wrong or not enabled for this account.");
  const models = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (models.ok) {
    const list = await models.json();
    const ids = (list.data ?? []).map((m) => m.id).filter((id) => /^gpt-5/.test(id)).sort();
    console.error(ids.length ? `\ngpt-5* models available to this key:\n  ${ids.join("\n  ")}` : "\nNo gpt-5* model is available to this key.");
    console.error("\nSet OPENAI_REASON_MODEL to one of these (locally and on Vercel).");
  }
}
process.exit(1);
