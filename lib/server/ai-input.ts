const MAX_IMAGE_BYTES = 1_500_000;
const ITEM_FIELDS = ["brand", "name", "category", "type", "budgetText", "fallback"] as const;
type ReasonItem = Record<(typeof ITEM_FIELDS)[number], string> & { matched: string[]; freeOf: string[] };

export type Validation<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * The base64 each format's signature bytes encode to, at offset 0 and on a whole-group
 * boundary so the encoding is exact rather than dependent on the bytes that follow.
 *
 * `/9j/` is four base64 characters, which is exactly three bytes: `FF D8 FF`, the JPEG
 * SOI marker plus the first byte of the marker that follows it. `iVBORw0K` is eight
 * characters, exactly six bytes: `89 50 4E 47 0D 0A`, the first six of the eight-byte
 * PNG signature. Both derived with `Buffer.from([...]).toString("base64")` rather than
 * written from memory.
 *
 * Why this is here at all: before it, `parseAnalyzeInput` checked that the string was
 * shaped like a data URL and that its base64 decoded to at most 1.5 MB, and nothing
 * else. 1.5 MB of `AAAA...` under a `data:image/jpeg;base64,` prefix passed, and the
 * route then paid a vision model to look at it. The declared media type is checked
 * against the actual bytes as well, so a PNG relabelled `image/jpeg` — which is what
 * the upstream request would have told the model it was sending — is refused too.
 */
const IMAGE_MAGIC: Record<"jpeg" | "png", string> = { jpeg: "/9j/", png: "iVBORw0K" };

export function parseAnalyzeInput(value: unknown): Validation<{ image: string }> {
  const image = value && typeof value === "object" ? (value as Record<string, unknown>).image : null;
  if (typeof image !== "string") return { ok: false, reason: "invalid image" };
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match || match[2].length % 4 !== 0) return { ok: false, reason: "invalid image" };
  const padding = match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0;
  if ((match[2].length * 3) / 4 - padding > MAX_IMAGE_BYTES) return { ok: false, reason: "image too large" };
  if (!match[2].startsWith(IMAGE_MAGIC[match[1] as "jpeg" | "png"])) return { ok: false, reason: "invalid image" };
  return { ok: true, value: { image } };
}

export function parseReasonInput(value: unknown): Validation<{ items: ReasonItem[]; lang?: string }> {
  const items = value && typeof value === "object" ? (value as Record<string, unknown>).items : null;
  if (!Array.isArray(items) || items.length < 1 || items.length > 8) return { ok: false, reason: "invalid items" };
  const valid = items.every((raw) => {
    if (!raw || typeof raw !== "object") return false;
    const item = raw as Record<string, unknown>;
    if (!ITEM_FIELDS.every((key) => typeof item[key] === "string" && (item[key] as string).length <= 200)) return false;
    return [item.matched, item.freeOf].every((list) => Array.isArray(list) && list.length <= 12 && list.every((s) => typeof s === "string" && s.length <= 80));
  });
  const lang = (value as Record<string, unknown>).lang;
  if (lang !== undefined && (typeof lang !== "string" || !["ko", "en", "ja", "zh", "ar"].includes(lang))) return { ok: false, reason: "invalid language" };
  return valid ? { ok: true, value: { items: items as ReasonItem[], lang: lang as string | undefined } } : { ok: false, reason: "invalid items" };
}
