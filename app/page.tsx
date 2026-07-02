import Link from "next/link";
import { Xiaohei } from "./components/sketch";

function Arrow({ w = 30 }: { w?: number }) {
  return (
    <svg width={w} height="16" viewBox="0 0 30 16" aria-hidden style={{ filter: "url(#sketch)" }}>
      <path d="M2 8 L23 8" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" />
      <path d="M23 8 L17 4 M23 8 L17 12" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <header className="flex items-center justify-between px-6 pt-7">
        <span style={{ fontFamily: "var(--font-hand)", fontSize: 32, lineHeight: 1 }}>결</span>
        <span style={{ fontFamily: "var(--font-hand)", fontSize: 19, color: "var(--muted)" }}>화장품, 덜 실패하게</span>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {/* 小黑 reading skin through a magnifier, with a red hand annotation */}
        <div style={{ position: "relative", marginBottom: 8 }}>
          <Xiaohei size={156} pose="magnify" bob />
          <span
            style={{
              position: "absolute",
              left: -58,
              top: 30,
              fontFamily: "var(--font-hand)",
              fontSize: 23,
              color: "var(--plum)",
              lineHeight: 1.05,
              transform: "rotate(-7deg)",
            }}
          >
            30초면<br />읽어요
          </span>
          <svg width="42" height="26" viewBox="0 0 42 26" aria-hidden style={{ position: "absolute", left: -8, top: 60, filter: "url(#sketch)" }}>
            <path d="M3 20 C14 6 28 4 38 11" stroke="var(--orange)" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M38 11 L31 10 M38 11 L34 17" stroke="var(--orange)" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </div>

        <h1 style={{ fontFamily: "var(--font-hand)", fontSize: 54, lineHeight: 1.04, margin: "4px 0 2px" }}>
          과장 없이,
          <br />
          너한테 딱 맞는 셋
        </h1>
        <p style={{ fontSize: 14.5, color: "var(--text-muted)", maxWidth: 270, lineHeight: 1.6, marginTop: 12 }}>
          4만원짜리 실패는 그만. 카메라로 피부를 읽고 솔직하게 골라드려요.
        </p>

        <div className="flex items-center justify-center" style={{ gap: 11, marginTop: 26, fontFamily: "var(--font-hand)", fontSize: 24, color: "var(--ink)" }}>
          <span>촬영</span>
          <Arrow />
          <span>분석</span>
          <Arrow />
          <span>추천</span>
        </div>
      </section>

      <div className="px-6" style={{ paddingBottom: 32 }}>
        <Link href="/scan" style={{ display: "block", textDecoration: "none" }}>
          <div style={{ position: "relative", padding: "17px 16px" }}>
            <div style={{ position: "absolute", inset: 0, border: "2.4px solid var(--ink)", borderRadius: 4, filter: "url(#sketch)" }} aria-hidden />
            <div className="flex items-center justify-center" style={{ position: "relative", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-hand)", fontSize: 27, color: "var(--ink)" }}>내 피부 결, 보러 가기</span>
              <span style={{ fontFamily: "var(--font-hand)", fontSize: 27, color: "var(--orange)" }}>→</span>
            </div>
          </div>
        </Link>
        <p style={{ textAlign: "center", fontFamily: "var(--font-hand)", fontSize: 17, color: "var(--text-muted)", marginTop: 11 }}>
          기본 스캔은 기기 안에서 처리 · 동의 없인 전송·저장 안 해요
        </p>
      </div>
    </main>
  );
}
