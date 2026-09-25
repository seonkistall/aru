/**
 * React-free i18n core, safe to import from lib code, web workers, and API
 * routes. Korean source strings ARE the message ids — `t("모공")` looks the
 * string up in the active language's dictionary and falls back to the Korean
 * original when missing. Interpolation: t("총 {n}개", { n: 3 }).
 *
 * Only the English dictionary is a static import. English is what the server
 * renders (`getServerSnapshot` in lib/i18n.tsx returns "en"), so it has to be
 * present synchronously or the hydration render would paint Korean source
 * strings against English server markup. Japanese, Chinese and Arabic are
 * fetched by `loadDict` through a dynamic `import()` with a literal path per
 * locale, which is what gives each one its own chunk; a visitor loads at most
 * one of the three, and a Korean visitor loads none.
 *
 * Node-side callers that need every dictionary at once without awaiting
 * anything (tests, scripts) import `lib/i18n/all` for its side effect.
 */

import { EN } from "./en";
import { DEVICE_DATA_KEY } from "../device-data";

export type Lang = "ko" | "en" | "ja" | "zh" | "ar";

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
];

const DICTS: Partial<Record<Lang, Record<string, string>>> = {
  en: EN,
};

export const LANG_STORAGE_KEY = DEVICE_DATA_KEY.language;

// Module singleton set by LanguageProvider before children render.
let currentLang: Lang = "ko";

// Notified whenever a dictionary arrives, so React can re-render the tree once
// the language it is waiting for is actually usable.
const dictListeners = new Set<() => void>();

export function getLang(): Lang {
  return currentLang;
}

export function setCurrentLang(lang: Lang) {
  currentLang = lang;
}

export function isLang(v: unknown): v is Lang {
  return v === "ko" || v === "en" || v === "ja" || v === "zh" || v === "ar";
}

/** Korean needs no dictionary — the message ids are the Korean strings. */
export function isDictReady(lang: Lang): boolean {
  return lang === "ko" || DICTS[lang] !== undefined;
}

export function registerDict(lang: Lang, dict: Record<string, string>) {
  if (lang === "ko") return;
  DICTS[lang] = dict;
  for (const listener of dictListeners) listener();
}

export function subscribeDicts(listener: () => void): () => void {
  dictListeners.add(listener);
  return () => {
    dictListeners.delete(listener);
  };
}

const pending: Partial<Record<Lang, Promise<void>>> = {};

/**
 * Resolve the dictionary for `lang`. The paths are written out one per case
 * because that is the shape Next.js's lazy-loading doc guarantees: of
 * `import('path/to/component')` it says "the path must be explicitly written.
 * It can't be a template string nor a variable."
 *
 * Measured, not assumed: rewriting this as a single `import(\`./${lang}\`)` and
 * building still splits under Turbopack 16.2.9 — `/`'s initial JS came to
 * 783878 bytes against 783030 for the form below. So the literal paths are the
 * documented-safe shape rather than the only one that works today.
 */
export function loadDict(lang: Lang): Promise<void> {
  if (isDictReady(lang)) return Promise.resolve();
  const existing = pending[lang];
  if (existing) return existing;
  let task: Promise<void>;
  switch (lang) {
    case "ja":
      task = import("./ja").then((m) => registerDict("ja", m.JA));
      break;
    case "zh":
      task = import("./zh").then((m) => registerDict("zh", m.ZH));
      break;
    case "ar":
      task = import("./ar").then((m) => registerDict("ar", m.AR));
      break;
    default:
      return Promise.resolve();
  }
  // A failed chunk fetch must not wedge the language forever: drop the cached
  // promise so a later attempt can retry, and leave the caller on the language
  // that is already painted rather than falling back to Korean source strings.
  task = task.catch(() => {
    delete pending[lang];
  });
  pending[lang] = task;
  return task;
}

export function t(msg: string, params?: Record<string, string | number>): string {
  let out = currentLang === "ko" ? msg : (DICTS[currentLang]?.[msg] ?? msg);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}
