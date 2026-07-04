import Link from "next/link";

// 404 for unknown routes — keeps users inside the brand instead of a bare
// Next.js default page, with a clear path back to the start.
export default function NotFound() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: "var(--paper)", color: "var(--ink)", gap: 14 }}
    >
      <p style={{ fontFamily: "var(--font-hand)", fontSize: 40, lineHeight: 1.1 }}>여긴 아무것도 없어요</p>
      <p style={{ fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.6, maxWidth: 320 }}>
        찾으시는 페이지가 사라졌거나 주소가 바뀌었어요.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 6,
          background: "var(--plum)",
          color: "var(--on-plum)",
          borderRadius: 8,
          padding: "13px 22px",
          fontSize: 15,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        처음으로 가기
      </Link>
    </main>
  );
}
