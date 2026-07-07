// Moongi visual kit — soft hand-drawn wobble filter + a minimal cosmetic helper.
// Style DNA: pure white, clean black shape, gentle eyes, small skincare props,
// restrained red/orange accents. Cute and calm, not editorial or grotesque.

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

// Moongi — a rounded black cosmetic helper with white eyes and tiny skincare props.
export function Xiaohei({ size = 130, pose = "stand", bob = false }: { size?: number; pose?: Pose; bob?: boolean }) {
  const ink = "var(--ink)";
  return (
    <svg
      width={size}
      height={size * 1.12}
      viewBox="0 0 120 134"
      fill="none"
      aria-hidden
      style={{ filter: "url(#sketch-soft)", animation: bob ? "gyeol-bob 2.6s ease-in-out infinite" : undefined }}
    >
      <path d="M46 96 L43 111" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M70 96 L73 111" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M39 111 C43 113 48 113 52 111" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M68 111 C72 113 77 113 81 111" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />

      <path d="M35 55 C35 38 45 28 60 28 C76 28 86 39 85 57 C86 78 77 99 60 99 C42 99 34 78 35 55 Z" fill={ink} />

      <circle cx="53" cy="56" r="4.8" fill="#fff" />
      <circle cx="67" cy="56" r="4.8" fill="#fff" />
      <path d="M54 68 Q60 72 66 68" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="45" cy="64" r="3.2" fill="rgba(255,152,140,.58)" />
      <circle cx="75" cy="64" r="3.2" fill="rgba(255,152,140,.58)" />
      <path d="M41 48 C34 47 30 43 29 38" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" />
      <path d="M80 48 C87 47 91 43 92 38" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" />

      {pose === "magnify" && (
        <>
          <path d="M81 70 L96 62" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="101" cy="52" r="12" stroke={ink} strokeWidth="2.6" fill="#fff" />
          <path d="M92 61 L86 68" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <path d="M98 52 L104 52 M101 49 L101 55" stroke="var(--plum)" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {pose === "carry" && (
        <>
          <path d="M80 72 C87 75 91 76 96 75" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <rect x="90" y="60" width="15" height="25" rx="4" stroke={ink} strokeWidth="2.4" fill="#fff" />
          <path d="M94 60 L94 55 L101 55 L101 60" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M94 71 L101 71" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="98" cy="78" r="2" fill="var(--plum)" />
        </>
      )}
      {pose === "funnel" && (
        <>
          <path d="M88 48 C97 45 106 45 114 48 L107 63 L100 63 Z" stroke={ink} strokeWidth="2.4" fill="#fff" strokeLinejoin="round" />
          <path d="M103 63 L103 78" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M94 38 L97 43 M106 36 L105 43 M116 39 L112 44" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {pose === "stand" && (
        <>
          <path d="M82 73 C89 75 93 73 96 68" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M95 60 L102 67 L93 68" stroke="var(--plum)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
