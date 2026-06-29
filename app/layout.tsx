import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "K-Beauty AI Camera",
  description: "카메라 피부 스캔과 설문을 바탕으로 맞춤 화장품을 추천합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
