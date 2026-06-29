import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tables = [
  "purchases",
  "checkins",
  "care_intents",
  "labels",
  "consent_events",
  "pilot_notes",
  "crop_samples",
];

function loadEnvFile(name) {
  const fullPath = path.join(rootDir, name);
  if (!existsSync(fullPath)) return;

  for (const line of readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function print(kind, label, detail = "") {
  const suffix = detail ? ` - ${detail}` : "";
  const method = kind === "fail" ? "error" : kind === "warn" ? "warn" : "log";
  console[method](`${kind} ${label}${suffix}`);
}

async function checkTable(supabase, table) {
  const { error, count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .limit(1);

  if (error) {
    print("fail", `table:${table}`, error.message);
    return false;
  }

  print("ok", `table:${table}`, count === null ? "reachable" : `${count} rows`);
  return true;
}

async function checkBucket(supabase) {
  const bucket = process.env.SUPABASE_CROP_BUCKET || "gyeol-crop-samples";
  const { data, error } = await supabase.storage.getBucket(bucket);

  if (error) {
    print("fail", `bucket:${bucket}`, error.message);
    return false;
  }

  if (data.public) {
    print("fail", `bucket:${bucket}`, "bucket is public; pilot crops must be private");
    return false;
  }

  print("ok", `bucket:${bucket}`, "private");
  return true;
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((key) => !process.env[key]);
  if (missing.length) {
    print("fail", "env", `missing ${missing.join(", ")}`);
    console.log("\nCopy .env.local.example to .env.local and fill the server-only Supabase values.");
    process.exit(1);
  }

  if (!process.env.SUPABASE_SYNC_TOKEN) {
    print("warn", "env:SUPABASE_SYNC_TOKEN", "/ops upload will reject POST requests");
  } else {
    print("ok", "env:SUPABASE_SYNC_TOKEN", "set");
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tableResults = [];
  for (const table of tables) {
    tableResults.push(await checkTable(supabase, table));
  }

  const bucketOk = await checkBucket(supabase);
  if (!tableResults.every(Boolean) || !bucketOk) {
    console.log("\nSupabase is not pilot-ready yet. Run supabase/schema.sql in SQL editor, create the private crop bucket, then rerun this check.");
    process.exit(1);
  }

  console.log("\nSupabase pilot sync is ready.");
}

main().catch((error) => {
  print("fail", "supabase:check", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
