// xiaohei visual kit — hand-drawn wobble filter + 小黑 character (drawn by hand in SVG).
// Style DNA: pure white, thin black line art with slight wobble, restrained red/orange/blue
// annotations, whimsical-not-cute. 小黑 = a black dot-eyed little worker, never a mascot.

export function SketchDefs() {
  // feDisplacementMap roughens straight strokes/borders so they read hand-drawn, not vector.
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      <defs>
        <filter id="sketch" x="-6%" y="-6%" width="112%" height="112%">
          <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" />
        </filter>
        <filter id="sketch-soft" x="-6%" y="-6%" width="112%" height="112%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4" />
        </filter>
      </defs>
    </svg>
  );
}

// Hand-drawn bordered box (wobbly outline via the sketch filter). Wrap button/link content.
export function SketchBox({
  children,
  filled = false,
  color = "var(--ink)",
  style,
}: {
  children: React.ReactNode;
  filled?: boolean;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ position: "relative", ...style }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          border: `2.2px solid ${color}`,
          borderRadius: 4,
          background: filled ? color : "transparent",
          filter: "url(#sketch)",
        }}
      />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

type Pose = "magnify" | "carry" | "funnel" | "stand";

// 小黑 — black blob, white dot eyes (blank/calm), thin legs, doing actual work.
export function Xiaohei({ size = 130, pose = "stand", bob = false }: { size?: number; pose?: Pose; bob?: boolean }) {
  const ink = "var(--ink)";
  return (
    <svg
      width={size}
      height={size * 1.18}
      viewBox="0 0 120 142"
      fill="none"
      aria-hidden
      style={{ filter: "url(#sketch)", animation: bob ? "gyeol-bob 2.6s ease-in-out infinite" : undefined }}
    >
      {/* stubby legs + little feet — short on purpose, petite reads cuter */}
      <path d="M50 100 L47 115" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M68 100 L71 115" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M43 115 L51 115" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M68 115 L76 115" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />

      {/* body — solid black, slightly irregular outline */}
      <path d="M38 58 C34 42 44 34 59 34 C74 34 84 43 81 59 C83 76 77 100 59 100 C40 100 36 76 38 58 Z" fill={ink} />

      {/* big round eyes + tiny smile + soft blush */}
      <circle cx="52" cy="60" r="4.6" fill="#fff" />
      <circle cx="66" cy="60" r="4.6" fill="#fff" />
      <path d="M53.5 70 Q59 74.5 64.5 70" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="45" cy="66.5" r="3" fill="rgba(255,152,140,.55)" />
      <circle cx="73" cy="66.5" r="3" fill="rgba(255,152,140,.55)" />

      {pose === "magnify" && (
        <>
          <path d="M80 70 L96 62" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="103" cy="50" r="12" stroke={ink} strokeWidth="2.6" fill="#fff" />
          <path d="M94 59 L88 66" stroke={ink} strokeWidth="3.2" strokeLinecap="round" />
          {/* red "found a point" mark inside the lens */}
          <path d="M103 45 L103 55 M98 50 L108 50" stroke="var(--plum)" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {pose === "carry" && (
        <>
          {/* arms holding a little bottle */}
          <path d="M80 72 L92 76" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <rect x="90" y="64" width="14" height="22" rx="2" stroke={ink} strokeWidth="2.4" fill="#fff" />
          <path d="M94 64 L94 58 L100 58 L100 64" stroke={ink} strokeWidth="2.2" fill="#fff" />
          <path d="M93 72 L101 72" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {pose === "funnel" && (
        <>
          {/* a funnel beside it, sorting things down */}
          <path d="M92 50 L116 50 L106 66 L102 66 Z" stroke={ink} strokeWidth="2.4" fill="#fff" />
          <path d="M104 66 L104 80" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M99 44 L101 38 M107 44 L110 39" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
