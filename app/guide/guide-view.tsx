import Link from "next/link";
import type { Guide } from "@/lib/guides";

/**
 * The served body of a guide page. A SERVER component with no "use client" and
 * no `t()`: the whole point of an indexable page is that the text is in the
 * first HTML response, so it is read with JavaScript disabled in
 * `tests/e2e/guide-pages.regression-33.spec.ts`. Every string comes from
 * `lib/guides.ts`, which builds them from the catalogue.
 *
 * Layout notes for 360x800: one column, `maxWidth` on the container rather than
 * on any child, `overflowWrap: "break-word"` on the long INCI lists, and 64px of
 * top padding so the h1 clears the fixed language pill
 * (`app/components/language-switcher.tsx`, top 10 / insetInlineEnd 10).
 */
export function GuideView({ guide }: { guide: Guide }) {
  return (
    <main className="min-h-screen" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <div style={{ width: "100%", maxWidth: 720, marginInline: "auto", padding: "64px 20px 40px" }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          <Link href="/" style={{ color: "var(--text-muted)" }}>ARU</Link> · Guide
        </p>

        <h1
          className="locale-display"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(30px, 8.5vw, 42px)",
            lineHeight: 1.2,
            margin: "10px 0 0",
            overflowWrap: "break-word",
          }}
        >
          {guide.h1}
        </h1>

        {guide.lede.map((line) => (
          <p key={line} style={body}>{line}</p>
        ))}

        <h2 style={heading}>{guide.lookForHeading}</h2>
        <p style={body}>{guide.lookForIntro}</p>
        <ul style={list}>
          {guide.lookFor.map((entry) => (
            <li key={entry.role} style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 700, color: "var(--ink)" }}>{entry.role}</span>
              <span>{` — ${entry.concernLine}`}</span>
              <br />
              <span style={{ fontSize: 13.5, overflowWrap: "break-word" }}>{entry.ingredientLine}</span>
            </li>
          ))}
        </ul>

        <h2 style={heading}>{guide.rowsHeading}</h2>
        <p style={body}>{guide.rowsIntro}</p>
        <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
          {guide.rows.map((row) => (
            <article key={row.id} data-guide-row={row.id} style={card}>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", fontWeight: 700 }}>{row.brand}</p>
              <h3 style={{ margin: "3px 0 0", fontSize: 18, lineHeight: 1.3, overflowWrap: "break-word" }}>{row.name}</h3>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                {row.volume ? `${row.price} · ${row.volume}` : row.price}
              </p>
              <p style={{ ...body, marginTop: 8 }}>{row.why}</p>
              <dl style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.6 }}>
                <Field label="Listed for" value={row.listedFor.join(", ")} />
                <Field
                  label="Ingredients"
                  value={row.ingredients.map((ing) => `${ing.inci} (${ing.roles.join(", ").toLowerCase()})`).join("; ")}
                />
                <Field label="Catalogue tags" value={row.highlights.join(", ")} />
                <Field label="Free of" value={row.freeOf.join(", ")} />
              </dl>
            </article>
          ))}
        </div>
        <p style={{ ...body, fontSize: 13 }}>{guide.priceNote}</p>

        <h2 style={heading}>Which one is yours</h2>
        <p style={body}>{guide.handoff}</p>
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <Link href="/scan" data-guide-cta="scan" style={primaryCta}>
            Take the 30-second scan →
          </Link>
          <Link href="/survey" data-guide-cta="survey" style={secondaryCta}>
            Or answer three questions instead
          </Link>
        </div>

        <p style={{ ...body, fontSize: 13 }}>{guide.provenance}</p>
        <p style={{ ...body, fontSize: 13 }}>
          {"Another guide: "}
          <Link href={guide.otherGuide.path} data-guide-cross-link style={{ color: "var(--ink)" }}>
            {guide.otherGuide.label}
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <>
      <dt style={{ color: "var(--muted)", fontWeight: 700 }}>{label}</dt>
      <dd style={{ margin: "0 0 6px", color: "var(--text-muted)", overflowWrap: "break-word" }}>{value}</dd>
    </>
  );
}

const body: React.CSSProperties = { fontSize: 14.5, lineHeight: 1.7, color: "var(--text-muted)", margin: "12px 0 0" };
const heading: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 25,
  lineHeight: 1.35,
  color: "var(--ink)",
  margin: "30px 0 0",
  overflowWrap: "break-word",
};
const list: React.CSSProperties = {
  margin: "14px 0 0",
  paddingInlineStart: 18,
  fontSize: 14.5,
  lineHeight: 1.6,
  color: "var(--text-muted)",
};
const card: React.CSSProperties = { border: "1.8px solid var(--ink)", borderRadius: 4, padding: "14px 14px 12px" };
const primaryCta: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "var(--tap-min)",
  border: "2.4px solid var(--ink)",
  borderRadius: 4,
  fontFamily: "var(--font-display)",
  fontSize: 22,
  color: "var(--ink)",
  textDecoration: "none",
  textAlign: "center",
  padding: "12px 14px",
};
const secondaryCta: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "var(--tap-min)",
  fontFamily: "var(--font-display)",
  fontSize: 19,
  color: "var(--text-muted)",
  textDecoration: "none",
  textAlign: "center",
  padding: "8px 12px",
};
