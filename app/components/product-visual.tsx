"use client";

// Self-contained per-category product illustration (no external assets). Used as
// the ProductCard visual until a real partner image URL is supplied — it reads
// as an intentional, designed product mock rather than a broken/plain fallback.
import type { Category } from "@/lib/skus";
import { t } from "@/lib/i18n/core";

type Tint = { bg: string; fg: string };

// Deterministic pastel from the brand name so a card without a real photo still
// reads as a designed product, not a broken image.
export function brandTint(brand: string): Tint {
  let hash = 0;
  for (let i = 0; i < brand.length; i += 1) hash = (hash * 31 + brand.charCodeAt(i)) % 360;
  return { bg: `hsl(${hash} 42% 94%)`, fg: `hsl(${hash} 38% 42%)` };
}

// Category -> container silhouette. Simple, clean line shapes on a tinted card.
function shape(category: Category, fg: string) {
  const stroke = { fill: "none", stroke: fg, strokeWidth: 2.2, strokeLinejoin: "round" as const };
  switch (category) {
    case "토너":
    case "에센스":
    case "선크림":
      // tall bottle
      return (
        <g>
          <rect x="29" y="10" width="10" height="7" rx="1.5" fill={fg} />
          <rect x="24" y="17" width="20" height="34" rx="4" {...stroke} />
          <rect x="27.5" y="30" width="13" height="12" rx="2" fill={fg} opacity="0.16" />
        </g>
      );
    case "클렌저":
    case "세럼":
      // tube
      return (
        <g>
          <rect x="30" y="9" width="8" height="6" rx="2" fill={fg} />
          <path d="M25 15 h18 l-2.5 34 a3 3 0 0 1 -3 3 h-7 a3 3 0 0 1 -3 -3 z" {...stroke} />
          <line x1="27" y1="24" x2="41" y2="24" stroke={fg} strokeWidth="1.6" opacity="0.5" />
        </g>
      );
    case "크림":
    case "아이크림":
      // jar
      return (
        <g>
          <rect x="22" y="14" width="24" height="6" rx="3" fill={fg} />
          <rect x="24" y="20" width="20" height="26" rx="4" {...stroke} />
        </g>
      );
    case "마스크팩":
    default:
      // pouch
      return (
        <g>
          <rect x="20" y="13" width="28" height="38" rx="5" {...stroke} />
          <line x1="20" y1="22" x2="48" y2="22" stroke={fg} strokeWidth="1.6" opacity="0.6" />
          <circle cx="34" cy="37" r="7" fill={fg} opacity="0.14" />
        </g>
      );
  }
}

export function ProductVisual({ category, brand, tint = brandTint(brand) }: { category: Category; brand: string; tint?: Tint }) {
  return (
    <svg viewBox="0 0 68 68" width="100%" height="100%" role="img" aria-label={`${t(brand)} ${t(category)}`}>
      <rect width="68" height="68" rx="10" fill={tint.bg} />
      {shape(category, tint.fg)}
      <text x="34" y="63" textAnchor="middle" fontSize="7" fontWeight="700" fill={tint.fg} opacity="0.75">
        {t(category)}
      </text>
    </svg>
  );
}
