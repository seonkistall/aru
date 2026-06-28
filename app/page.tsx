import Link from "next/link";

export default function Home() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: "var(--paper)" }}
    >
      <span
        style={{
          fontSize: 12,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--bronze)",
          fontWeight: 600,
        }}
      >
        믿을 수 있는 화장품 추천
      </span>

      <h1
        style={{
          fontFamily: "var(--font-ko-serif)",
          fontSize: 44,
          lineHeight: 1.18,
          color: "var(--ink)",
          margin: "16px 0 12px",
        }}
      >
        과장 없이,
        <br />
        너한테 딱 맞는 셋
      </h1>

      <p style={{ fontSize: 16, color: "var(--text-muted)", maxWidth: 320, marginBottom: 30 }}>
        4만원짜리 실패는 그만. 카메라로 피부를 읽고, 솔직하게 골라줍니다.
      </p>

      <div style={{ height: 1, width: 34, background: "var(--bronze)", opacity: 0.75, marginBottom: 30 }} />

      <Link
        href="/scan"
        style={{
          background: "var(--plum)",
          color: "var(--on-plum)",
          borderRadius: 8,
          padding: "15px 28px",
          fontSize: 15,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        내 피부 결 확인하기 →
      </Link>
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 14 }}>
        30초 · 사진은 기기 안에서만 처리돼요
      </p>
    </main>
  );
}
