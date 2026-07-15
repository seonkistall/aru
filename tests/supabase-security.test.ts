import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const schema = readFileSync(resolve(root, "supabase/schema.sql"), "utf8");
const store = readFileSync(resolve(root, "lib/store.ts"), "utf8");

const tables = [
  "purchases", "checkins", "care_intents", "labels", "consent_events",
  "pilot_notes", "funnel_events", "crop_samples", "reengage_contacts",
];

describe("Supabase production boundary", () => {
  it.each(tables)("enables RLS for %s", (table) => {
    expect(schema).toMatch(new RegExp(`alter table ${table} enable row level security;`, "i"));
  });

  it.each(tables)("revokes browser roles for %s", (table) => {
    expect(schema).toMatch(new RegExp(`revoke all on table ${table} from anon, authenticated;`, "i"));
  });

  it("keeps consumer storage local instead of using the browser Supabase client", () => {
    expect(store).not.toContain("getSupabase");
    expect(store).not.toContain(".from(");
  });
});
