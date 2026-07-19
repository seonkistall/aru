/**
 * React-free i18n core, safe to import from lib code, web workers, and API
 * routes. Korean source strings ARE the message ids — `t("모공")` looks the
 * string up in the active language's dictionary and falls back to the Korean
 * original when missing. Interpolation: t("총 {n}개", { n: 3 }).
 */

import { EN } from "./en";
import { JA } from "./ja";
import { ZH } from "./zh";
import { AR } from "./ar";
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
  ja: JA,
  zh: ZH,
  ar: AR,
};

export const LANG_STORAGE_KEY = DEVICE_DATA_KEY.language;

// Module singleton set by LanguageProvider before children render.
let currentLang: Lang = "ko";

export function getLang(): Lang {
  return currentLang;
}

export function setCurrentLang(lang: Lang) {
  currentLang = lang;
}

export function isLang(v: unknown): v is Lang {
  return v === "ko" || v === "en" || v === "ja" || v === "zh" || v === "ar";
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
