"use client";

import { useEffect, useRef, useState } from "react";
import { LANGS, useLang, type Lang } from "../../lib/i18n";
import { supportsFlagEmoji } from "../../lib/flag-support";

/**
 * Fixed top-right language picker. Sketch-styled pill that expands into a
 * small list; persists via LanguageProvider (localStorage) and remounts the
 * app in the chosen language.
 */
export function LanguageSwitcher() {
  const { saved, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const [flags, setFlags] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Canvas measurement is client-only, and detecting during render would
    // desync from the server markup, so probe after mount. Starting false
    // avoids briefly painting the regional-indicator letter fallback.
    /* eslint-disable react-hooks/set-state-in-effect */
    setFlags(supportsFlagEmoji());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const current = LANGS.find((l) => l.code === saved) ?? LANGS[0];

  const pick = (code: Lang) => {
    setLang(code);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "fixed", top: 10, insetInlineEnd: 10, zIndex: 90 }}>
      <button
        type="button"
        aria-label="Language"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          minHeight: "var(--tap-min)",
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
        {flags && <span aria-hidden>{current.flag}</span>}
        {current.label}
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            insetInlineEnd: 0,
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
              aria-selected={l.code === saved}
              onClick={() => pick(l.code)}
              style={{
                display: "block",
                width: "100%",
                minHeight: "var(--tap-min)",
                textAlign: "start",
                padding: "8px 12px",
                fontSize: 13,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: l.code === saved ? "var(--orange, #e8590c)" : "var(--ink, #222)",
                fontWeight: l.code === saved ? 700 : 400,
              }}
            >
              {flags && <span aria-hidden style={{ marginInlineEnd: 6 }}>{l.flag}</span>}
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
