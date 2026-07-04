import type { ReactNode } from "react";

// Absolute-fill centered column, used by every camera phase overlay
// (scanning, denied, unsupported, no-face, feedback).
export function Center({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 24, textAlign: "center" }}>
      {children}
    </div>
  );
}
