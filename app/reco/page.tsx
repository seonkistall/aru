"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RecoRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/report");
  }, [router]);

  return <main style={{ minHeight: "100vh", background: "var(--paper)" }} />;
}
