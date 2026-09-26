"use client";

/**
 * React bindings for the i18n core (see lib/i18n/core.ts for the gettext-style
 * design). The language lives in localStorage and is read through
 * useSyncExternalStore, so SSR/hydration always starts from the English
 * default and the client re-renders once with the saved language. LanguageProvider remounts
 * the subtree via key={lang} on change, so plain t() calls anywhere
 * (components or lib code running during render) pick up the new language
 * without subscribing to context.
 */

import React, { createContext, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import {
  isDictReady,
  isLang,
  LANG_STORAGE_KEY,
  loadDict,
  setCurrentLang,
  subscribeDicts,
  type Lang,
} from "./i18n/core";

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

// First visit (no saved choice): English is the product default regardless of
// browser language (global-first positioning). Users switch via the picker and
// only an explicit pick persists.
function defaultLang(): Lang {
  return "en";
}

function getSnapshot(): Lang {
  if (memoryLang) return memoryLang;
  try {
    const v = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(v)) return v;
  } catch {
    // accessing localStorage itself can throw (cookies/site data blocked) —
    // getSnapshot runs during render, so fall through to the default
  }
  memoryLang = defaultLang();
  return memoryLang;
}

// (b) of the lost-tap fix: start the dictionary fetch when this module is first
// evaluated instead of waiting for LanguageProvider's effect to run after
// hydration. It shortens the English interval; it cannot close it, because the
// dictionary is a second network round trip after the bundle that asks for it.
// ko and en are already ready, so this is a no-op for them.
if (typeof window !== "undefined") {
  const initial = getSnapshot();
  if (!isDictReady(initial)) void loadDict(initial);
}

function getServerSnapshot(): Lang {
  // SSR paints in the product default (English) so first visits don't flash
  // Korean; clients with a saved choice re-render once after hydration.
  return "en";
}

// The server renders English and lib/i18n/core.ts imports that dictionary
// statically, so the server — and therefore the hydration render — is never
// waiting on a chunk.
function getServerDictReady(): boolean {
  return true;
}

// `lang` is what is on screen; `saved` is what the visitor chose and may be one
// chunk ahead of it. The picker reads `saved` so a tap registers immediately;
// everything that renders text reads `lang`.
type LangContextValue = { lang: Lang; saved: Lang; setLang: (lang: Lang) => void };

const LangContext = createContext<LangContextValue>({ lang: "ko", saved: "ko", setLang: () => {} });

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
  const saved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // ja/zh/ar dictionaries arrive over the network (lib/i18n/core.ts). Reading
  // the registry through a store means the tree re-renders when one lands
  // instead of painting Korean message ids while the chunk is still in flight.
  const ready = useSyncExternalStore(subscribeDicts, () => isDictReady(saved), getServerDictReady);
  const active = ready ? saved : getServerSnapshot();

  // Keep the singleton in sync before children render.
  setCurrentLang(active);

  // loadDict resolves either way: on a failed chunk fetch it drops its cached
  // promise and resolves with the dictionary still missing. Remember that, so the
  // hold below lets go and the visitor keeps a usable English page instead of an
  // inert one that nothing will ever release.
  const [unavailable, setUnavailable] = useState<Lang | null>(null);
  useEffect(() => {
    if (isDictReady(saved)) return;
    let live = true;
    void loadDict(saved).then(() => {
      if (live && !isDictReady(saved)) setUnavailable(saved);
    });
    return () => {
      live = false;
    };
  }, [saved]);

  // (c) of the lost-tap fix. While `active !== saved` the tree on screen is the
  // one key={active} is about to throw away, so every piece of React state a
  // visitor creates in it — the camera on /scan, six survey answers, the
  // /privacy delete confirmation — is discarded at the remount. Hold the
  // document for exactly that interval instead of accepting actions that cannot
  // survive: `inert` makes hit-testing act as `pointer-events: none` and text
  // selection as `user-select: none` (HTML, "A node ... can be inert"), and it
  // needs no wrapper element, so the ko/en path renders and lays out exactly as
  // before. The spec adds that authors "should not specify elements as inert
  // unless the content they represent are also visually obscured in some way";
  // the CSS rule keyed on data-aru-lang-pending in app/globals.css is that cue,
  // dimming the controls without moving anything.
  const holding = active !== saved && unavailable !== saved;
  useIsomorphicLayoutEffect(() => {
    if (!holding) return;
    const body = document.body;
    body.setAttribute("inert", "");
    body.setAttribute("aria-busy", "true");
    body.setAttribute("data-aru-lang-pending", "");
    return () => {
      body.removeAttribute("inert");
      body.removeAttribute("aria-busy");
      body.removeAttribute("data-aru-lang-pending");
    };
  }, [holding]);

  useIsomorphicLayoutEffect(() => {
    document.documentElement.lang = active === "zh" ? "zh-CN" : active;
    // Arabic is the only RTL language we ship; dir must flip with it so flex
    // rows, text alignment, and scroll direction follow the script. It follows
    // the language actually on screen, not the saved one, so the page never
    // sits in RTL with Latin text while the Arabic chunk loads.
    document.documentElement.dir = active === "ar" ? "rtl" : "ltr";
  }, [active]);

  return (
    <LangContext.Provider value={{ lang: active, saved, setLang }}>
      <React.Fragment key={active}>{children}</React.Fragment>
    </LangContext.Provider>
  );
}
