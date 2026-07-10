"use client";

import { useEffect, useRef, useState } from "react";
import { LANGS, useLang, type Lang } from "../../lib/i18n";

/**
 * Fixed top-right language picker. Sketch-styled pill that expands into a
 * small list; persists via LanguageProvider (localStorage) and remounts the
 * app in the chosen language.
 */
export function LanguageSwitcher() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  const pick = (code: Lang) => {
    setLang(code);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "fixed", top: 10, right: 10, zIndex: 90 }}>
      <button
        type="button"
        aria-label="Language"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          background: "var(--paper, #fff)",
          border: "1.6px solid var(--ink, #222)",
          borderRadius: 999,
          filter: "url(#sketch-soft)",
          fontSize: 12.5,
          color: "var(--ink, #222)",
          cursor: "pointer",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="8" cy="8" r="6.6" />
          <path d="M1.4 8h13.2M8 1.4c-2 2.2-2 11 0 13.2M8 1.4c2 2.2 2 11 0 13.2" />
        </svg>
        {current.label}
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            right: 0,
            marginTop: 6,
            background: "var(--paper, #fff)",
            border: "1.6px solid var(--ink, #222)",
            borderRadius: 8,
            filter: "url(#sketch-soft)",
            overflow: "hidden",
            minWidth: 108,
          }}
        >
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              role="option"
              aria-selected={l.code === lang}
              onClick={() => pick(l.code)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 13,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: l.code === lang ? "var(--orange, #e8590c)" : "var(--ink, #222)",
                fontWeight: l.code === lang ? 700 : 400,
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
