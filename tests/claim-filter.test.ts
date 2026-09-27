import { describe, expect, it } from "vitest";
import { reasonClean } from "@/lib/claim-filter";

describe("multilingual banned-claims gate (reasonClean)", () => {
  it("keeps blocking Korean claims via efficacyClean regardless of lang", () => {
    expect(reasonClean("여드름 치료에 좋아요", "ko")).toBe(false);
    expect(reasonClean("미백 효과가 있어요", "en")).toBe(false);
  });

  it("blocks English verb inflections, not just base forms", () => {
    expect(reasonClean("Great for treating acne while staying light.", "en")).toBe(false);
    expect(reasonClean("Guarantees visible results in a week.", "en")).toBe(false);
    expect(reasonClean("Curing breakouts overnight.", "en")).toBe(false);
    expect(reasonClean("Erasing dark spots gently.", "en")).toBe(false);
    expect(reasonClean("Eliminating wrinkles fast.", "en")).toBe(false);
    expect(reasonClean("Removes acne scars and regenerates skin.", "en")).toBe(false);
    expect(reasonClean("Lifts and firms with anti aging power.", "en")).toBe(false);
    expect(reasonClean("Noticeably improves skin tone.", "en")).toBe(false);
  });

  it("blocks Japanese kanji and katakana loanword claim forms", () => {
    expect(reasonClean("肌の再生をサポートします。", "ja")).toBe(false);
    expect(reasonClean("ホワイトニングケアにぴったり。", "ja")).toBe(false);
    expect(reasonClean("アンチエイジングにおすすめ。", "ja")).toBe(false);
    expect(reasonClean("シミを除去します。", "ja")).toBe(false);
  });

  it("blocks Chinese efficacy claim forms", () => {
    expect(reasonClean("有抗衰老再生功能。", "zh")).toBe(false);
    expect(reasonClean("祛斑淡斑一步到位。", "zh")).toBe(false);
    expect(reasonClean("提拉紧致轮廓。", "zh")).toBe(false);
  });

  // The nine sentences that leaked on 2026-09-20, kept as the regression. Each names
  // the concept from the Korean BANNED list that lib/claim-filter.ts's header says it
  // mirrors and that the language had no equivalent for. They are ordinary LLM phrasing,
  // not adversarial strings: "a visible brightening effect" is what a model writes when
  // told to sell a product in one sentence.
  it("blocks the efficacy/effect family, which en, zh and ar had no word for", () => {
    expect(reasonClean("A gentle formula with a visible brightening effect.", "en")).toBe(false);
    expect(reasonClean("Proven efficacy on enlarged pores.", "en")).toBe(false);
    expect(reasonClean("对油性肌肤效果明显。", "zh")).toBe(false);
    expect(reasonClean("温和有效，适合日常使用。", "zh")).toBe(false);
    expect(reasonClean("فعالية عالية للبشرة الدهنية.", "ar")).toBe(false);
    expect(reasonClean("منتج فعال لتقليل اللمعان.", "ar")).toBe(false);
  });

  it("blocks Arabic improvement and treatment claims", () => {
    // ar had no entry for 개선 at all until 2026-09-20, and no Arabic case in this file.
    expect(reasonClean("يساعد على تحسين ملمس البشرة.", "ar")).toBe(false);
    expect(reasonClean("علاج مثالي لحب الشباب.", "ar")).toBe(false);
    expect(reasonClean("تبييض البشرة بلطف.", "ar")).toBe(false);
    expect(reasonClean("نتيجة مضمونة خلال أسبوع.", "ar")).toBe(false);
  });

  it("blocks dermatology framing, which the Korean list bans as 피부과", () => {
    expect(reasonClean("Dermatologist recommended for sensitive skin.", "en")).toBe(false);
    expect(reasonClean("皮肤科医生推荐。", "zh")).toBe(false);
    expect(reasonClean("皮膚科でも使われる処方です。", "ja")).toBe(false);
    expect(reasonClean("피부과에서도 쓰는 성분이에요", "ko")).toBe(false);
  });

  // The second gap, found by the supervisor in the cycle 46 review and closed
  // 2026-09-27. Every concept the lists already held NAMED a state; none covered
  // a verb claiming to change one in the ordinary direction, so the sentences
  // below passed both gates while "improves skin tone" two blocks up did not.
  it("blocks verbs that claim to change a condition, which neither list covered", () => {
    expect(reasonClean("Reduces excess sebum through the day.", "en")).toBe(false);
    expect(reasonClean("Controls oil without stripping.", "en")).toBe(false);
    expect(reasonClean("Minimises the look of enlarged pores.", "en")).toBe(false);
    expect(reasonClean("Minimizes the look of enlarged pores.", "en")).toBe(false);
    expect(reasonClean("Prevents new breakouts overnight.", "en")).toBe(false);
    expect(reasonClean("Fades dark spots over time.", "en")).toBe(false);
    expect(reasonClean("Brightens a dull complexion.", "en")).toBe(false);
    expect(reasonClean("Visibly firms slack skin.", "en")).toBe(false);
  });

  it("blocks the same verbs in Korean, whatever the requested language", () => {
    // efficacyClean runs first on every candidate, so one Korean entry covers all
    // five locales — the same reason the 2026-09-20 additions only ever mattered
    // for the four non-Korean lists.
    expect(reasonClean("피지를 감소시켜요", "ko")).toBe(false);
    expect(reasonClean("여드름 예방에 좋아요", "ko")).toBe(false);
    expect(reasonClean("피지 분비를 억제해요", "ko")).toBe(false);
    expect(reasonClean("피지를 감소시켜요", "en")).toBe(false);
  });

  it("blocks the same verbs in ja, zh and ar", () => {
    expect(reasonClean("皮脂を減少させます。", "ja")).toBe(false);
    expect(reasonClean("ニキビ予防にぴったり。", "ja")).toBe(false);
    expect(reasonClean("皮脂の分泌を抑制します。", "ja")).toBe(false);
    expect(reasonClean("毛穴を引き締めます。", "ja")).toBe(false);
    expect(reasonClean("减少多余油脂。", "zh")).toBe(false);
    expect(reasonClean("预防痘痘反复。", "zh")).toBe(false);
    expect(reasonClean("抑制油脂分泌。", "zh")).toBe(false);
    expect(reasonClean("يساعد على تقليل الزيوت الزائدة.", "ar")).toBe(false);
    expect(reasonClean("يقلل من لمعان البشرة.", "ar")).toBe(false);
    expect(reasonClean("يمنع ظهور الحبوب.", "ar")).toBe(false);
    expect(reasonClean("وقاية يومية للبشرة الدهنية.", "ar")).toBe(false);
    expect(reasonClean("تفتيح لون البشرة تدريجيًا.", "ar")).toBe(false);
  });

  // The entries that were deliberately NOT added, pinned so a later cycle that
  // reaches for the blunter root sees these fail. Arabic matches as a substring,
  // so bare منع would fire on منعش ("refreshing", the catalogue's word for 산뜻)
  // and bare شد on الشد ("tightness", in the care tip for 밤사이 당김). English
  // \bfirm\b is the same risk handled by a word boundary: lib/i18n/en.ts ships
  // "Capture quality confirmed." and "Confirm device data deletion".
  it("does not fire on shipped copy that merely contains a banned root", () => {
    expect(reasonClean("قوام منعش يناسب الصباح.", "ar")).toBe(true);
    expect(reasonClean("طبقة رقيقة من الكريم تساعد مع الشد الليلي.", "ar")).toBe(true);
    expect(reasonClean("Capture quality confirmed.", "en")).toBe(true);
    expect(reasonClean("Confirm device data deletion before you leave.", "en")).toBe(true);
  });

  it("passes neutral descriptive copy in every language", () => {
    expect(reasonClean("가볍게 마무리되는 젤 타입이에요.", "ko")).toBe(true);
    expect(reasonClean("A light gel texture that suits oily skin.", "en")).toBe(true);
    expect(reasonClean("さっぱりしたジェルタイプで、オイリーな肌質に合います。", "ja")).toBe(true);
    expect(reasonClean("清爽的凝胶质地，适合油性肤质。", "zh")).toBe(true);
    expect(reasonClean("قوام جل خفيف يناسب البشرة الدهنية.", "ar")).toBe(true);
  });
});
