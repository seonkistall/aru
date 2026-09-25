import type { Metadata } from "next";
import { seoMetadata } from "@/lib/seo";

export const metadata: Metadata = seoMetadata("/unsubscribe");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
