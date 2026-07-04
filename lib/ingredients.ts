/**
 * Ingredient dictionary (화해/올리브영-style). Each entry carries the KR display
 * name, the EN INCI name, and NEUTRAL function tags — descriptive cosmetic roles
 * only, never medical/efficacy claims (must pass efficacyClean). This is the
 * layer a real olive young / 화해 ingredient feed would populate; the SKU catalog
 * references ingredients by key so the UI can render key-ingredient tags and the
 * engine can match ingredient roles to a user's concerns.
 */

// Neutral cosmetic function tags (no 개선/완화/미백/효과 etc.).
export type IngredientRole =
  | "보습"
  | "수분"
  | "진정"
  | "장벽"
  | "피지밸런스"
  | "결케어"
  | "각질케어"
  | "탄력케어"
  | "톤케어"
  | "컨디셔닝";

export type Ingredient = {
  key: string;
  name: string;
  inci: string;
  roles: IngredientRole[];
  note: string;
};

function ing(key: string, name: string, inci: string, roles: IngredientRole[], note: string): Ingredient {
  return { key, name, inci, roles, note };
}

export const INGREDIENTS: Record<string, Ingredient> = Object.fromEntries(
  [
    ing("niacinamide", "나이아신아마이드", "Niacinamide", ["피지밸런스", "톤케어", "장벽"], "피지·톤·장벽을 두루 돌보는 대표 성분."),
    ing("hyaluronic", "히알루론산", "Sodium Hyaluronate", ["수분", "보습"], "수분을 끌어와 촉촉함을 채우는 보습 성분."),
    ing("panthenol", "판테놀", "Panthenol", ["진정", "보습", "장벽"], "예민해진 피부를 달래는 진정·보습 성분."),
    ing("ceramide", "세라마이드", "Ceramide NP", ["장벽", "보습"], "피부 장벽 결을 메워주는 보습 성분."),
    ing("centella", "센텔라(시카)", "Centella Asiatica Extract", ["진정", "장벽"], "붉고 예민한 피부를 위한 진정 성분."),
    ing("houttuynia", "어성초 추출물", "Houttuynia Cordata Extract", ["진정", "피지밸런스"], "번들거리고 예민한 피부를 위한 진정 성분."),
    ing("madecassoside", "마데카소사이드", "Madecassoside", ["진정", "장벽"], "센텔라 유래 진정 성분."),
    ing("glycerin", "글리세린", "Glycerin", ["수분", "보습"], "가장 기본적인 보습·수분 성분."),
    ing("betaine", "베타인", "Betaine", ["수분", "진정"], "순하게 수분을 더하는 성분."),
    ing("allantoin", "알란토인", "Allantoin", ["진정", "컨디셔닝"], "피부결을 편안하게 하는 진정 성분."),
    ing("bha", "살리실산(BHA)", "Salicylic Acid", ["각질케어", "피지밸런스"], "모공 속 각질·피지를 정돈하는 성분."),
    ing("pha", "글루코노락톤(PHA)", "Gluconolactone", ["각질케어", "수분"], "순한 각질케어 성분."),
    ing("lha", "LHA", "Capryloyl Salicylic Acid", ["각질케어", "결케어"], "결을 매끄럽게 정돈하는 순한 각질 성분."),
    ing("adenosine", "아데노신", "Adenosine", ["탄력케어"], "탄력 결을 돌보는 코스메틱 성분."),
    ing("peptide", "펩타이드", "Palmitoyl Tripeptide-1", ["탄력케어", "컨디셔닝"], "탄력·컨디셔닝을 위한 펩타이드."),
    ing("vitc_derivative", "비타민C 유도체", "Ascorbyl Glucoside", ["톤케어"], "톤을 맑게 정돈하는 순한 비타민C 유도체."),
    ing("tranexamic", "트라넥삼산", "Tranexamic Acid", ["톤케어"], "칙칙한 톤을 정돈하는 코스메틱 성분."),
    ing("greentea", "녹차 추출물", "Camellia Sinensis Leaf Extract", ["진정", "피지밸런스"], "번들거림과 예민함을 함께 케어."),
    ing("propolis", "프로폴리스", "Propolis Extract", ["보습", "컨디셔닝"], "촉촉한 윤기를 더하는 컨디셔닝 성분."),
    ing("mugwort", "쑥 추출물", "Artemisia Vulgaris Extract", ["진정"], "예민한 피부를 위한 진정 성분."),
    ing("birch", "자작나무 수액", "Betula Alba Juice", ["수분", "진정"], "수분감 있는 순한 진정 성분."),
    ing("deepsea", "해양심층수", "Sea Water", ["수분", "컨디셔닝"], "미네랄 수분감을 더하는 성분."),
    ing("squalane", "스쿠알란", "Squalane", ["보습", "컨디셔닝"], "산뜻하게 유수분을 잡아주는 보습 성분."),
    ing("shea", "시어버터", "Butyrospermum Parkii Butter", ["보습", "장벽"], "건조한 피부를 감싸는 리치 보습 성분."),
    ing("zinc", "징크(산화아연)", "Zinc Oxide", ["피지밸런스", "컨디셔닝"], "선케어에 쓰이는 무기 자외선 차단 성분."),
    ing("cica_complex", "시카 콤플렉스", "Centella Asiatica Extract", ["진정", "장벽"], "센텔라 성분 복합체."),
    ing("heartleaf", "약모밀(어성초)", "Houttuynia Cordata Water", ["진정", "피지밸런스"], "진정·피지밸런스 워터 성분."),
    ing("collagen", "콜라겐", "Hydrolyzed Collagen", ["보습", "탄력케어"], "촉촉함과 탄력 결을 돌보는 성분."),
  ].map((entry) => [entry.key, entry])
);

export function ingredient(key: string): Ingredient | undefined {
  return INGREDIENTS[key];
}

export function ingredientNames(keys: string[]): string[] {
  return keys.map((key) => INGREDIENTS[key]?.name ?? key);
}

export function rolesFor(keys: string[]): IngredientRole[] {
  const set = new Set<IngredientRole>();
  for (const key of keys) for (const role of INGREDIENTS[key]?.roles ?? []) set.add(role);
  return [...set];
}
