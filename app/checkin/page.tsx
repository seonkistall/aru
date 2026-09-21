"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCheckins, getProductUses, recordCheckin, type ProductUse } from "@/lib/store";
import { SKUS, type Sku } from "@/lib/skus";
import { commerceOutHref, primaryCommerceLink } from "@/lib/commerce";
import { CommerceDisclosure } from "@/app/components/commerce-disclosure";
import { recordFunnelEvent } from "@/lib/funnel";
import { ProductVisual } from "@/app/components/product-visual";
import { Xiaohei } from "@/app/components/sketch";
import { t } from "@/lib/i18n/core";
import { useFunnelPageView } from "@/app/use-funnel-page-view";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// The check-in round from REAL elapsed time. 0 = not yet due after the user
// explicitly records that they started using a product.
const roundFor = (ts: number) => {
  const weeks = (Date.now() - ts) / WEEK_MS;
  return weeks >= 4 ? 4 : weeks >= 2 ? 2 : 0;
};

export default function Checkin() {
  // The landing page for every re-engagement email, and until now the only step
  // of the journey that recorded nothing at all — so nobody could tell whether
  // those emails bring anyone back.
  useFunnelPageView("checkin_opened");
  const [productUses, setProductUses] = useState<ProductUse[] | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([getProductUses(), getCheckins()]).then(([allProductUses, checkins]) => {
      // Keep only the latest explicitly confirmed use start for each product.
      const seenSku = new Set<string>();
      const nextProductUses = allProductUses.filter((use) => (seenSku.has(use.sku_id) ? false : seenSku.add(use.sku_id)));
      // Done is per round (2주/4주): a week-2 checkin must not block the
      // week-4 one the re-engagement email brings the user back for.
      const initial: Record<string, boolean> = {};
      for (const use of nextProductUses) {
        const round = roundFor(use.ts);
        if (checkins.some((c) => c.sku_id === use.sku_id && c.week === round)) initial[use.id] = true;
      }
      setDone(initial);
      setProductUses(nextProductUses);
    });
  }, []);

  if (productUses === null) return <main style={{ minHeight: "100vh", background: "var(--paper)" }} />;

  const dueProductUses = productUses.filter((use) => roundFor(use.ts) > 0);
  const allDone = dueProductUses.length > 0 && dueProductUses.every((use) => done[use.id]);

  return (
    <main className="min-h-screen px-5 py-9" style={{ background: "var(--paper)" }}>
      <div className="mx-auto" style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <div>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minWidth: 44,
                minHeight: 44,
                fontFamily: "var(--font-display)",
                fontSize: 22,
                color: "var(--ink)",
                textDecoration: "none",
              }}
            >
              {t("아루")}
            </Link>
            <p style={{ ...eyebrow, marginTop: 8 }}>{t("사용 후 체크인")}</p>
            <h1 style={titleStyle}>{t("스킨케어, 직접 써보니 어땠나요?")}</h1>
          </div>
          <Xiaohei size={54} pose="carry" />
        </div>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "6px 0 26px", lineHeight: 1.55 }}>
          {t("짧게 사용감을 남겨두면 내 루틴을 돌아보기 좋아요.")}
        </p>

        {productUses.length === 0 ? (
          <div style={{ textAlign: "center", padding: "22px 18px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12 }}>
            <p style={{ fontSize: 14.5, color: "var(--ink)", marginBottom: 6, fontWeight: 700 }}>{t("아직 기록된 사용 제품이 없어요")}</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.55 }}>
              {t("추천 리포트에서 사용 시작을 기록하면 여기에서 2·4주 후 사용감을 남길 수 있어요.")}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/report" style={ctaPrimary}>{t("내 리포트 보기")}</Link>
              <Link href="/scan" style={ctaGhost}>{t("피부 스캔하기")}</Link>
            </div>
          </div>
        ) : (
          <>
            {productUses.map((productUse) => (
              <CheckinCard key={productUse.id} productUse={productUse} done={Boolean(done[productUse.id])} onDone={() => setDone((d) => ({ ...d, [productUse.id]: true }))} />
            ))}
            {allDone && (
              <div style={{ textAlign: "center", padding: "18px", marginTop: 6 }}>
                <p style={{ fontSize: 14, color: "var(--ink)", marginBottom: 12 }}>{t("체크인을 모두 마쳤어요. 다음 스킨케어가 궁금할 때 다시 피부를 살펴보세요.")}</p>
                <Link href="/scan" style={ctaPrimary}>{t("오늘 피부 다시 살펴보기")}</Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export function CheckinCard({ productUse, done, onDone }: { productUse: ProductUse; done: boolean; onDone: () => void }) {
  const [sat, setSat] = useState<number | null>(null);
  const [trouble, setTrouble] = useState<boolean | null>(null);
  const [repurchase, setRepurchase] = useState<boolean | null>(null);
  // Survives `done`, which the parent also sets from storage on mount. A user who
  // said 할래요 in this session gets the buy link; one returning to an already-answered
  // card does not, because the answer is all that was stored and re-offering a
  // purchase to someone who may already have made it is worse than not offering.
  const [justSaidRepurchase, setJustSaidRepurchase] = useState(false);
  // `save` awaits before the button unmounts, so two taps inside that window both
  // passed the `ready` guard and fired `repurchase_intent` twice.
  const [saving, setSaving] = useState(false);
  const ready = sat !== null && trouble !== null && repurchase !== null;

  const sku = SKUS.find((s) => s.id === productUse.sku_id);
  const round = roundFor(productUse.ts);
  const due = round > 0;

  async function save() {
    if (!ready || !due || saving) return;
    setSaving(true);
    const week = round === 4 ? 4 : 2;
    await recordCheckin({ sku_id: productUse.sku_id, week, satisfaction: sat, trouble, repurchase });
    if (repurchase) {
      // The product asked "재구매 할래요?", the answer was yes, and until now that
      // answer went into localStorage and nowhere else. Skincare is consumable, so
      // this is the moment a retained user is worth more than a new one.
      recordFunnelEvent("repurchase_intent", { week, satisfaction: sat });
      setJustSaidRepurchase(true);
    }
    onDone();
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: done || !due ? 0 : 14 }}>
        <div style={{ width: 46, height: 46, flexShrink: 0 }}>
          <ProductVisual category={sku?.category ?? "세럼"} brand={sku?.brand ?? productUse.name} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
            <span style={due ? weekBadge : softBadge}>{due ? t("{round}주차", { round }) : t("사용 중")}</span>
          </div>
          <p style={{ fontFamily: "var(--font-ko-serif)", fontSize: 16, color: "var(--ink)" }}>{t(productUse.name)}</p>
        </div>
      </div>
      {!due ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>{t("2주 정도 사용해 본 뒤에 다시 물어볼게요.")}</p>
      ) : done ? (
        <CheckinDone showRepurchase={justSaidRepurchase} sku={sku} />
      ) : (
        <>
          <Row label="만족도"><Seg options={["별로", "보통", "좋음"]} value={sat} onPick={setSat} /></Row>
          <Row label="트러블"><Toggle value={trouble} onPick={setTrouble} yes="있었어요" no="없었어요" /></Row>
          <Row label="재구매"><Toggle value={repurchase} onPick={setRepurchase} yes="할래요" no="아니요" /></Row>
          <button onClick={save} disabled={!ready || saving} style={saveBtn(ready && !saving)}>{t("기록하기")}</button>
        </>
      )}
    </div>
  );
}

/**
 * The answered state of a card, extracted so BOTH of its branches can be rendered by a
 * test. A review of the first version of this change found that four of its six cases
 * were `expect(source).toContain(...)` greps, and that all four still passed with the
 * buy link deleted from the render tree — a grep cannot see whether a component is
 * mounted. Taking `showRepurchase` as a prop rather than reading the parent's state
 * leaves only the one-line wiring untested instead of the whole branch.
 */
export function CheckinDone({ showRepurchase, sku }: { showRepurchase: boolean; sku?: Sku }) {
  return (
    <>
      <p role="status" style={{ fontSize: 13, color: "var(--success)", marginTop: 6 }}>{t("남겨주신 피드백을 저장했어요.")}</p>
      {showRepurchase && sku ? <RepurchaseLink sku={sku} /> : null}
    </>
  );
}

/** The buy link a 재구매 = 할래요 answer earns. Same shape as the product card's:
 *  `/api/out` for the redirect so the click is attributable, and the disclosure
 *  above it, which `tests/commerce-disclosure.test.ts` requires of every surface
 *  that renders one. */
export function RepurchaseLink({ sku }: { sku: Sku }) {
  const commerce = primaryCommerceLink(sku);
  const placement = "checkin_repurchase";
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>{t("다 쓰기 전에 같은 제품을 다시 볼까요?")}</p>
      <CommerceDisclosure style={{ marginTop: 6, marginBottom: 10 }} />
      <a
        href={commerceOutHref(sku.id, commerce.merchant, placement)}
        target="_blank"
        rel="noopener noreferrer nofollow sponsored"
        onClick={() => recordFunnelEvent("commerce_clicked", { placement, merchant: commerce.merchant })}
        style={repurchaseBtn}
      >
        {t("{merchant}에서 다시 보기", { merchant: t(commerce.label) })}
      </a>
    </div>
  );
}

const repurchaseBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "var(--tap-min)",
  width: "100%",
  padding: "10px 14px",
  borderRadius: 9,
  border: "1.4px solid var(--plum)",
  background: "var(--plum-soft)",
  color: "var(--plum-press)",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", gap: 12 }}>
      <span style={{ fontSize: 14, color: "var(--ink-soft)" }}>{t(label)}</span>
      {children}
    </div>
  );
}

function Seg({ options, value, onPick }: { options: string[]; value: number | null; onPick: (value: number) => void }) {
  return <div style={{ display: "flex", gap: 6 }}>{options.map((option, i) => <button key={option} onClick={() => onPick(i + 1)} aria-pressed={value === i + 1} style={pill(value === i + 1)}>{t(option)}</button>)}</div>;
}

function Toggle({ value, onPick, yes, no }: { value: boolean | null; onPick: (value: boolean) => void; yes: string; no: string }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button onClick={() => onPick(true)} aria-pressed={value === true} style={pill(value === true)}>{t(yes)}</button>
      <button onClick={() => onPick(false)} aria-pressed={value === false} style={pill(value === false)}>{t(no)}</button>
    </div>
  );
}

function pill(on: boolean): React.CSSProperties {
  return {
    // The 44px contract, both ways. Without it these are 35.5px high in every locale,
    // and the single-glyph answers are narrow too (zh 好 37px, ar لا 31.4px). Same shape
    // as app/studio/page.tsx's toggle and app/survey/page.tsx's chipStyle, which is
    // where the 44px minimum was already applied to this exact control.
    minHeight: "var(--tap-min)",
    minWidth: "var(--tap-min)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    padding: "7px 11px",
    borderRadius: 8,
    border: on ? "1px solid var(--plum)" : "1px solid var(--line)",
    background: on ? "var(--plum-soft)" : "var(--surface)",
    color: on ? "var(--plum-press)" : "var(--ink)",
    fontWeight: on ? 700 : 500,
    cursor: "pointer",
  };
}

function saveBtn(ready: boolean): React.CSSProperties {
  return {
    width: "100%",
    marginTop: 12,
    background: ready ? "var(--plum)" : "var(--surface-tint)",
    color: ready ? "var(--on-plum)" : "var(--muted)",
    border: "none",
    borderRadius: 8,
    padding: "12px",
    fontSize: 14,
    fontWeight: 700,
    cursor: ready ? "pointer" : "default",
  };
}

const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--bronze)", fontWeight: 700 };
const titleStyle: React.CSSProperties = { fontFamily: "var(--font-ko-serif)", fontSize: 28, color: "var(--ink)", margin: "6px 0 6px" };
const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: 18, marginBottom: 14 };
const weekBadge: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "var(--on-plum)", background: "var(--plum)", borderRadius: 999, padding: "2px 8px" };
const softBadge: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", background: "var(--surface-tint)", border: "1px solid var(--line)", borderRadius: 999, padding: "2px 8px" };
const ctaPrimary: React.CSSProperties = { display: "inline-block", background: "var(--plum)", color: "var(--on-plum)", borderRadius: 8, padding: "11px 18px", fontSize: 14, fontWeight: 700, textDecoration: "none" };
const ctaGhost: React.CSSProperties = { display: "inline-block", background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "11px 18px", fontSize: 14, fontWeight: 700, textDecoration: "none" };
