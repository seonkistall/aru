import type { Metadata } from "next";
import { seoMetadata } from "@/lib/seo";

export const metadata: Metadata = seoMetadata("/guide/toner-for-oily-skin");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
