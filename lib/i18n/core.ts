/**
 * React-free i18n core, safe to import from lib code, web workers, and API
 * routes. Korean source strings ARE the message ids — `t("모공")` looks the
 * string up in the active language's dictionary and falls back to the Korean
 * original when missing. Interpolation: t("총 {n}개", { n: 3 }).
 */

import { EN } from "./en";
import { JA } from "./ja";
import { ZH } from "./zh";
import { DEVICE_DATA_KEY } from "../device-data";

export type Lang = "ko" | "en" | "ja" | "zh";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];

const DICTS: Partial<Record<Lang, Record<string, string>>> = {
  en: EN,
  ja: JA,
  zh: ZH,
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
  return v === "ko" || v === "en" || v === "ja" || v === "zh";
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
