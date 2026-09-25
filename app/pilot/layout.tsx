import type { Metadata } from "next";
import { seoMetadata } from "@/lib/seo";

// Research-only surface. `proxy.ts` already answers 404 or 401 here in
// production; the noindex tag is the second layer, for any deploy that has
// `INTERNAL_TOOLS_USER` set.
export const metadata: Metadata = seoMetadata("/pilot");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
