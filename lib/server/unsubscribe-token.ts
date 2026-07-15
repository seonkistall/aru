import { createHmac, timingSafeEqual } from "node:crypto";

export function createUnsubscribeToken(email: string, secret: string, expiresAt: number) {
  const payload = Buffer.from(JSON.stringify({ email: email.trim().toLowerCase(), expiresAt })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyUnsubscribeToken(token: string, secret: string, now = Date.now()): { email: string; expiresAt: number } | null {
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof value.email === "string" && typeof value.expiresAt === "number" && value.expiresAt >= now ? value : null;
  } catch { return null; }
}
