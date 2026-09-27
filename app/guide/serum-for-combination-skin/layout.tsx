import type { Metadata } from "next";
import { seoMetadata } from "@/lib/seo";

export const metadata: Metadata = seoMetadata("/guide/serum-for-combination-skin");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
