"use client";
import { useState } from "react";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  async function unsubscribe() {
    setState("sending");
    const response = await fetch("/api/reengage/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    setState(response?.ok ? "done" : "error");
  }
  return <main className="min-h-screen px-5 py-16" style={{ background: "var(--paper)" }}><div className="mx-auto" style={{ maxWidth: 420 }}><h1 style={{ fontSize: 28, marginBottom: 12 }}>Reminder email settings</h1>{state === "done" ? <p role="status">Reminder emails have been stopped.</p> : <><p>You can stop ARU 2- and 4-week reminder emails.</p><button onClick={unsubscribe} disabled={!token || state === "sending"} style={{ marginTop: 20, padding: "12px 18px" }}>Unsubscribe</button>{state === "error" && <p role="alert">The link is invalid or expired.</p>}</>}</div></main>;
}
