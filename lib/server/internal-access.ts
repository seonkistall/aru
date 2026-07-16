import { createHash, timingSafeEqual } from "node:crypto";

export type InternalAccessDecision = "allow" | "challenge" | "not-found";

type InternalAccessEnv = {
  NODE_ENV?: string;
  INTERNAL_TOOLS_USER?: string;
  INTERNAL_TOOLS_PASSWORD?: string;
};

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function exactCredentials(provided: string, expected: string) {
  return timingSafeEqual(digest(provided), digest(expected));
}

export function internalAccessDecision(request: Request, env: InternalAccessEnv): InternalAccessDecision {
  if (env.NODE_ENV !== "production") return "allow";

  const expectedUser = env.INTERNAL_TOOLS_USER;
  const expectedPassword = env.INTERNAL_TOOLS_PASSWORD;
  if (!expectedUser || !expectedPassword) return "not-found";

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Basic ")) return "challenge";

  const encoded = authorization.slice(6).trim();
  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return "challenge";
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return "challenge";

  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  return exactCredentials(`${user}\0${password}`, `${expectedUser}\0${expectedPassword}`) ? "allow" : "challenge";
}
