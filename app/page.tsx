import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "var(--paper)" }}>
      <span style={eyebrow}>K-Beauty AI Camera</span>
      <h1 style={headline}>
        사진 한 장으로
        <br />
        내 피부에 맞는 선택
      </h1>
      <p style={lead}>
        모바일 카메라로 피부 상태를 가볍게 확인하고, 설문 답변과 함께 맞춤 화장품을 추천받아보세요.
      </p>
      <div style={{ height: 1, width: 34, background: "var(--bronze)", opacity: 0.75, marginBottom: 30 }} />
      <Link href="/scan" style={cta}>피부 스캔 시작</Link>
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 14 }}>사진은 기본적으로 기기 안에서 처리돼요.</p>
    </main>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const headline: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 44, lineHeight: 1.18, color: "var(--ink)", margin: "16px 0 12px" };
const lead: React.CSSProperties = { fontSize: 16, color: "var(--text-muted)", maxWidth: 340, marginBottom: 30, lineHeight: 1.6 };
const cta: React.CSSProperties = { background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "15px 28px", fontSize: 15, fontWeight: 700, textDecoration: "none" };
