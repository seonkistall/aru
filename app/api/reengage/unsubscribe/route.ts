import { retentionAfterRevocation } from "@/lib/reengage";
import { parseUnsubscribeInput } from "@/lib/server/reengage-input";
import { readBoundedJson, RequestGuardError } from "@/lib/server/request-guard";
import { verifyUnsubscribeToken } from "@/lib/server/unsubscribe-token";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  let token = "";
  try {
    const parsed = parseUnsubscribeInput(await readBoundedJson(request, 4096));
    if (!parsed.ok) return Response.json({ ok: false, reason: parsed.reason }, { status: 400 });
    token = parsed.value.token;
  } catch (error) {
    const status = error instanceof RequestGuardError ? error.status : 400;
    return Response.json({ ok: false, reason: status === 413 ? "request too large" : "invalid json" }, { status });
  }
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) return Response.json({ ok: false, reason: "not configured" }, { status: 503 });
  const verified = verifyUnsubscribeToken(token, secret);
  if (!verified) return Response.json({ ok: false, reason: "invalid token" }, { status: 400 });
  const admin = await getSupabaseAdmin();
  if (!admin) return Response.json({ ok: false, reason: "not configured" }, { status: 503 });
  const now = Date.now();
  const { error } = await admin.from("reengage_contacts").update({ consent: false, revoked_at: new Date(now).toISOString(), retention_until: new Date(retentionAfterRevocation(now)).toISOString() }).eq("email", verified.email);
  return Response.json({ ok: !error }, { status: error ? 500 : 200 });
}
