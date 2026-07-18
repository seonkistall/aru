type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };
type ReengageLocale = "ko" | "en" | "ja" | "zh";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REENGAGE_LOCALES = new Set<ReengageLocale>(["ko", "en", "ja", "zh"]);

function recordWithOnly(input: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  return Object.keys(row).some((key) => !allowed.includes(key)) ? null : row;
}

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return EMAIL_RE.test(email) && email.length <= 254 ? email : null;
}

export function parseSubscribeInput(input: unknown): ParseResult<{ email: string; consent: true; context: string; locale: ReengageLocale }> {
  const row = recordWithOnly(input, ["email", "consent", "context", "locale"]);
  if (!row || (row.context !== undefined && typeof row.context !== "string")) return { ok: false, reason: "invalid body" };
  const email = normalizedEmail(row.email);
  if (!email) return { ok: false, reason: "invalid email" };
  if (row.consent !== true) return { ok: false, reason: "consent required" };
  const locale = row.locale === undefined ? "ko" : row.locale;
  if (typeof locale !== "string" || !REENGAGE_LOCALES.has(locale as ReengageLocale)) {
    return { ok: false, reason: "invalid locale" };
  }
  const context = typeof row.context === "string" ? row.context.trim() : "";
  if (context.length > 200) return { ok: false, reason: "context too long" };
  return { ok: true, value: { email, consent: true, context, locale: locale as ReengageLocale } };
}

export function parseManualReengageInput(input: unknown): ParseResult<{ email: string; week: 2 | 4; locale: ReengageLocale }> {
  const row = recordWithOnly(input, ["email", "week", "locale"]);
  if (!row) return { ok: false, reason: "invalid body" };
  const email = normalizedEmail(row.email);
  if (!email) return { ok: false, reason: "invalid email" };
  if (row.week !== 2 && row.week !== 4) return { ok: false, reason: "invalid week" };
  const locale = row.locale === undefined ? "ko" : row.locale;
  if (typeof locale !== "string" || !REENGAGE_LOCALES.has(locale as ReengageLocale)) {
    return { ok: false, reason: "invalid locale" };
  }
  return { ok: true, value: { email, week: row.week, locale: locale as ReengageLocale } };
}

export function parseUnsubscribeInput(input: unknown): ParseResult<{ token: string }> {
  const row = recordWithOnly(input, ["token"]);
  if (!row) return { ok: false, reason: "invalid body" };
  if (typeof row.token !== "string" || row.token.length < 1 || row.token.length > 2048) {
    return { ok: false, reason: "invalid token" };
  }
  return { ok: true, value: { token: row.token } };
}
