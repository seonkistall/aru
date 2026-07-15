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

const foreignKeyIndexes = [
  ["purchases", "user_id"],
  ["checkins", "user_id"],
  ["care_intents", "user_id"],
  ["labels", "user_id"],
  ["consent_events", "user_id"],
  ["pilot_notes", "user_id"],
  ["crop_samples", "consent_event_id"],
  ["crop_samples", "user_id"],
] as const;

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

  it("revokes future browser privileges for tables, sequences, and functions", () => {
    expect(schema).toMatch(/alter default privileges for role postgres in schema public\s+revoke select, insert, update, delete on tables from anon, authenticated, service_role;/i);
    expect(schema).toMatch(/alter default privileges for role postgres in schema public\s+revoke usage, select on sequences from anon, authenticated, service_role;/i);
    expect(schema).toMatch(/alter default privileges for role postgres in schema public\s+revoke execute on functions from anon, authenticated, service_role;/i);
    expect(schema).toMatch(/alter default privileges for role postgres in schema public\s+revoke execute on functions from public;/i);
  });

  it("keeps the crop bucket private without modifying managed Storage ACLs", () => {
    expect(schema).toMatch(/insert into storage\.buckets[\s\S]+gyeol-crop-samples[\s\S]+false/i);
    expect(schema).not.toMatch(/create policy[\s\S]+storage\.(?:objects|buckets)/i);
    expect(schema).not.toMatch(/(?:grant|revoke)[^;]+on (?:table )?storage\.(?:objects|buckets)/i);
  });

  it("retains explicit service-role access", () => {
    expect(schema).toMatch(/grant all on all tables in schema public to service_role;/i);
    expect(schema).toMatch(/grant all on all sequences in schema public to service_role;/i);
    expect(schema).not.toMatch(/alter default privileges[\s\S]+grant all on tables to service_role;/i);
  });

  it.each(foreignKeyIndexes)("indexes %s.%s", (table, column) => {
    expect(schema).toMatch(new RegExp(
      `create index if not exists ${table}_${column}_idx on ${table} \\(${column}\\);`,
      "i",
    ));
  });
});
