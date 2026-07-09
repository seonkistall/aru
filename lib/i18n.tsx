"use client";

/**
 * React bindings for the i18n core (see lib/i18n/core.ts for the gettext-style
 * design). LanguageProvider remounts the subtree via key={lang} on change, so
 * plain t() calls anywhere (components or lib code running during render)
 * pick up the new language without subscribing to context.
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import { isLang, LANG_STORAGE_KEY, setCurrentLang, type Lang } from "./i18n/core";

export { getLang, LANGS, t, type Lang } from "./i18n/core";

function readStoredLang(): Lang {
  if (typeof window === "undefined") return "ko";
  const v = window.localStorage.getItem(LANG_STORAGE_KEY);
  return isLang(v) ? v : "ko";
}

type LangContextValue = { lang: Lang; setLang: (lang: Lang) => void };

const LangContext = createContext<LangContextValue>({ lang: "ko", setLang: () => {} });

export function useLang(): LangContextValue {
  return useContext(LangContext);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ko");

  // Read the saved language after mount (SSR always renders Korean; the
  // key={lang} remount below re-renders everything in the saved language).
  useEffect(() => {
    const saved = readStoredLang();
    if (saved !== "ko") {
      setCurrentLang(saved);
      setLangState(saved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  }, [lang]);

  const setLang = (next: Lang) => {
    setCurrentLang(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // storage unavailable (private mode) — language still switches for the session
    }
    setLangState(next);
  };

  // Keep the singleton in sync before children render.
  setCurrentLang(lang);

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <React.Fragment key={lang}>{children}</React.Fragment>
    </LangContext.Provider>
  );
}
