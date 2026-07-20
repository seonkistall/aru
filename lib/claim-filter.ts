import { efficacyClean } from "./recommend";

// efficacyClean() covers the Korean banned-claims list; non-Korean LLM output
// needs its own guard or medical/efficacy wording would slip past the
// compliance gate. Mirrors the intent of lib/recommend.ts BANNED (치료·미백·
// 개선·완화·재생·제거·리프팅·항노화·효능·효과·보장) including verb inflections
// (treating/curing/…) and CJK loanword forms (ホワイトニング/抗衰老/祛斑).
// A false positive only downgrades to the pre-approved template fallback, so
// the filter errs strict.
export const BANNED_BY_LANG: Record<string, RegExp> = {
  en: /\b(cur(?:e|es|ed|ing)|treat(?:s|ed|ing|ment|ments)?|heal(?:s|ed|ing)?|whiten(?:s|ed|ing)?|clinically|guarantee(?:s|d|ing)?|medical|prescription|anti[- ]?ag(?:e|ing)|eras(?:e|es|ed|ing)|eliminat(?:e|es|ed|ing|ion)|remov(?:e|es|ed|ing|al)|regenerat(?:e|es|ed|ing|ion)|lift(?:s|ed|ing)?|improv(?:e|es|ed|ing|ement)|reliev(?:e|es|ed|ing)|sooth(?:e|es|ed|ing))\b/i,
  ja: /(治療|治す|治る|効能|効果|美白|保証|医療|処方|改善|完治|再生|除去|緩和|リフトアップ|リフティング|ホワイトニング|アンチエイジング|エイジングケア)/,
  zh: /(治疗|治愈|疗效|功效|美白|保证|医疗|处方|改善|根治|再生|去除|祛除|祛斑|淡斑|舒缓|缓解|提拉|紧致|抗衰老|抗老)/,
  // Arabic: JS \b doesn't work on Arabic letters, so these act as substring
  // matches like ja/zh. Roots cover cure/treat (علاج/عالج/شفاء), whitening
  // (تبييض), medical/prescription (طبي/وصفة), guarantee (يضمن/مضمون/ضمان),
  // regenerate/remove/lift (تجديد/إزالة/يزيل/شد البشرة), anti-aging
  // (مكافحة الشيخوخة/مضاد للشيخوخة), relieve (تخفيف/يخفف).
  ar: /(علاج|عالج|يعالج|معالجة طبية|شفاء|يشفي|تبييض|طبي|وصفة|يضمن|مضمون|ضمان|تجديد|إزالة|يزيل|شد البشرة|مكافحة الشيخوخة|مضاد للشيخوخة|تخفيف|يخفف)/,
};

export function reasonClean(candidate: string, lang: string): boolean {
  if (!efficacyClean(candidate).ok) return false;
  const banned = BANNED_BY_LANG[lang];
  return banned ? !banned.test(candidate) : true;
}
