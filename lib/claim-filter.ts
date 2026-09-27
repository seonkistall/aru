import { efficacyClean } from "./recommend";

// efficacyClean() covers the Korean banned-claims list; non-Korean LLM output
// needs its own guard or medical/efficacy wording would slip past the
// compliance gate. Mirrors lib/recommend.ts BANNED (치료·미백·개선·완화·재생·
// 제거·리프팅·항노화·효능·효과·보장·피부과) including verb inflections
// (treating/curing/…) and CJK loanword forms (ホワイトニング/抗衰老/祛斑).
// A false positive only downgrades to the pre-approved template fallback, so
// the filter errs strict.
//
// "Mirrors" was an aspiration until 2026-09-20 and three of the concepts in that
// list had no equivalent in some of the languages, measured rather than assumed:
// 효능/효과 was absent from `en` (effect/efficacy/proven) and from `ar`, plain
// 효과 was absent from `zh` (which had only the compounds 功效/疗效), 개선 was
// absent from `ar`, and 피부과 was absent from `en`, `zh` and `ja`. Nine claim
// sentences an LLM would plausibly produce passed the gate; the same nine are
// now cases in tests/claim-filter.test.ts. The gap only ever mattered for the
// four non-Korean locales — efficacyClean() runs first on every candidate, so
// the Korean spellings were blocked in all of them the whole time.
//
// Two of the additions are deliberately blunt. English `effect` catches "a
// cooling effect" as well as "a whitening effect", and Arabic `تأثير`/`فعال`
// catch neutral uses of influence/effective. Both are efficacy vocabulary in a
// one-sentence product blurb, and the cost of being wrong is one template
// fallback, which is pre-approved copy — the asymmetry the header's last line
// is about.
//
// 2026-09-27 (cycle 46 review): a second kind of gap, measured the same way.
// Every concept in the lists NAMED a state (whitening, regeneration, efficacy);
// none covered a verb that claims to CHANGE one in the ordinary direction. So
// "reduces excess sebum", "controls oil all day", "prevents breakouts",
// "visibly firms" and "fades dark spots" all passed, in every language, while
// "improves skin tone" was blocked — a distinction no compliance reading
// supports. The additions are reduce / control / minimise / minimize / prevent
// / fade / brighten / firm in `en`, 減少 / 予防 / 抑制 / 引き締め in `ja`,
// 减少 / 预防 / 抑制 in `zh`, تقليل / يقلل / وقاية / يمنع / تفتيح in `ar`, and
// 감소 / 예방 / 억제 in the Korean list in lib/recommend.ts. Each has a case in
// tests/claim-filter.test.ts.
//
// This is INFERENCE from the lists' own logic, not a reading of a statute. The
// primary Korean sources (화장품법 시행규칙 별표 5, MFDS 표시·광고 guidance) are
// unreachable from this container — law.go.kr, mfds.go.kr, easylaw.go.kr and
// kcia.or.kr each answer `curl: (56) CONNECT tunnel failed, response 403`
// (statuses recorded verbatim in the cycle 47 entry of docs/AUTOPILOT.md).
// Whether each word is prohibited is a legal question for the owner's counsel.
//
// Two entries were deliberately NOT added, because Arabic matches as a
// substring and both would have fired on shipped copy:
//   - bare `منع` (prevent) is inside `منعش` ("refreshing"), which is the
//     catalogue's own word for 산뜻 (lib/i18n/ar.ts). `يمنع` is used instead.
//   - bare `شد` (tighten/firm) is inside `الشد` ("tightness"), which the care
//     tip for 밤사이 당김 uses. The list keeps the existing `شد البشرة` phrase.
// English `\bfirm\b` was checked against the same risk: the word boundary means
// it does not fire on `confirmed`, which lib/i18n/en.ts does ship.
export const BANNED_BY_LANG: Record<string, RegExp> = {
  en: /\b(cur(?:e|es|ed|ing)|treat(?:s|ed|ing|ment|ments)?|heal(?:s|ed|ing)?|whiten(?:s|ed|ing)?|clinical(?:ly)?|guarantee(?:s|d|ing)?|medical|prescription|dermatolog(?:y|ist|ists|ical|ically)|anti[- ]?ag(?:e|ing)|eras(?:e|es|ed|ing)|eliminat(?:e|es|ed|ing|ion)|remov(?:e|es|ed|ing|al)|regenerat(?:e|es|ed|ing|ion)|lift(?:s|ed|ing)?|improv(?:e|es|ed|ing|ement)|reliev(?:e|es|ed|ing)|sooth(?:e|es|ed|ing)|effect(?:s|ive|iveness)?|efficac(?:y|ious)|proven|reduc(?:e|es|ed|ing|tion)|control(?:s|led|ling)?|minimis(?:e|es|ed|ing|ation)|minimiz(?:e|es|ed|ing|ation)|prevent(?:s|ed|ing|ion|ative)?|fad(?:e|es|ed|ing)|brighten(?:s|ed|ing)?|firm(?:s|ed|ing|ness)?)\b/i,
  ja: /(治療|治す|治る|効能|効果|美白|保証|医療|処方|皮膚科|改善|完治|再生|除去|緩和|リフトアップ|リフティング|ホワイトニング|アンチエイジング|エイジングケア|減少|予防|抑制|引き締め)/,
  zh: /(治疗|治愈|疗效|功效|效果|有效|见效|美白|保证|医疗|处方|皮肤科|改善|根治|再生|去除|祛除|祛斑|淡斑|舒缓|缓解|提拉|紧致|抗衰老|抗老|减少|预防|抑制)/,
  // Arabic: JS \b doesn't work on Arabic letters, so these act as substring
  // matches like ja/zh. Roots cover cure/treat (علاج/عالج/شفاء), whitening
  // (تبييض), medical/prescription (طبي/وصفة), guarantee (يضمن/مضمون/ضمان),
  // regenerate/remove/lift (تجديد/إزالة/يزيل/شد البشرة), anti-aging
  // (مكافحة الشيخوخة/مضاد للشيخوخة), relieve (تخفيف/يخفف), improve
  // (تحسين/تحسن/يحسن), efficacy/effect (فعالية/فعال/تأثير/مفعول), dermatology
  // (جلدية). Substring matching is what makes the bare roots enough: Arabic
  // attaches its definite article and prepositions as PREFIXES, so "تحسين" also
  // catches التحسين and بتحسين without an entry each.
  ar: /(علاج|عالج|يعالج|معالجة طبية|شفاء|يشفي|تبييض|طبي|جلدية|وصفة|يضمن|مضمون|ضمان|تجديد|إزالة|يزيل|شد البشرة|مكافحة الشيخوخة|مضاد للشيخوخة|تخفيف|يخفف|تحسين|تحسن|يحسن|فعالية|فعال|تأثير|مفعول|تقليل|يقلل|وقاية|يمنع|تفتيح)/,
};

export function reasonClean(candidate: string, lang: string): boolean {
  if (!efficacyClean(candidate).ok) return false;
  const banned = BANNED_BY_LANG[lang];
  return banned ? !banned.test(candidate) : true;
}
