"use client";

/**
 * React bindings for the i18n core (see lib/i18n/core.ts for the gettext-style
 * design). The language lives in localStorage and is read through
 * useSyncExternalStore, so SSR/hydration always starts from Korean and the
 * client re-renders once with the saved language. LanguageProvider remounts
 * the subtree via key={lang} on change, so plain t() calls anywhere
 * (components or lib code running during render) pick up the new language
 * without subscribing to context.
 */

import React, { createContext, useContext, useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { isLang, LANG_STORAGE_KEY, setCurrentLang, type Lang } from "./i18n/core";

// html[lang] must update before the swapped text paints — the CJK wrapping CSS
// keys off html[lang], so a plain useEffect leaves ja/zh text one frame under
// Korean keep-all rules. The server has no layout pass; fall back to useEffect
// there to avoid the SSR warning.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export { getLang, LANGS, t, type Lang } from "./i18n/core";

const LANG_EVENT = "aru:lang-change";

// In-memory fallback so the switch still works when localStorage is
// unavailable (private mode).
let memoryLang: Lang | null = null;

function subscribe(callback: () => void) {
  window.addEventListener(LANG_EVENT, callback);
  return () => window.removeEventListener(LANG_EVENT, callback);
}

// First visit (no saved choice): follow the browser language so international
// testers land in a language they can read without hunting for the switcher.
// Detected once per session (stable snapshot); only an explicit pick persists.
function detectBrowserLang(): Lang {
  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("en")) return "en";
  if (nav.startsWith("ja")) return "ja";
  if (nav.startsWith("zh")) return "zh";
  return "ko";
}

function getSnapshot(): Lang {
  if (memoryLang) return memoryLang;
  try {
    const v = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(v)) return v;
  } catch {
    // accessing localStorage itself can throw (cookies/site data blocked) —
    // getSnapshot runs during render, so fall through to detection
  }
  memoryLang = detectBrowserLang();
  return memoryLang;
}

function getServerSnapshot(): Lang {
  return "ko";
}

type LangContextValue = { lang: Lang; setLang: (lang: Lang) => void };

const LangContext = createContext<LangContextValue>({ lang: "ko", setLang: () => {} });

export function useLanguage(): LangContextValue {
  return useContext(LangContext);
}

export const useLang = useLanguage;

function setLang(next: Lang) {
  memoryLang = next;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, next);
  } catch {
    // storage unavailable — memoryLang keeps the session working
  }
  window.dispatchEvent(new Event(LANG_EVENT));
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Keep the singleton in sync before children render.
  setCurrentLang(lang);

  useIsomorphicLayoutEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <React.Fragment key={lang}>{children}</React.Fragment>
    </LangContext.Provider>
  );
}
