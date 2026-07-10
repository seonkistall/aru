# Spec — 아루 i18n 시스템 기술 명세

- **버전**: v1.1 (PR #32 · #33)
- **관련**: [i18n-prd.md](i18n-prd.md) · [i18n-ux-flow.md](i18n-ux-flow.md)

---

## 1. 설계 원칙

**gettext 스타일 — 한국어 원문이 곧 메시지 ID.**

```ts
t("모공")                    // → "Pores" (en) / "毛穴" (ja) / "毛孔" (zh) / "모공" (ko·미등록 폴백)
t("총 {n}개", { n: 3 })      // → "3 total" — {placeholder} 보간, 언어별 어순 자유
```

선택 이유:
1. **마이그레이션이 기계적** — 기존 한국어 문자열을 `t()`로 감싸기만 하면 됨. 키 네이밍/등록 단계 없음
2. **한국어 union 타입 보존** — `SkinType = "지성" | "건성" | ...` 같은 타입 레벨 값이 코드 전반의 로직 비교에 쓰임. 데이터는 내부적으로 한국어 유지, **번역은 렌더 시점**에만
3. **안전 폴백** — 사전 미등록 문자열은 한국어 원문 그대로 노출 (키 노출·크래시 없음)

### 데이터 영속 원칙 (PR #33에서 확립)

> **저장은 한국어 원본(canonical), 번역은 렌더에서.**

localStorage/sessionStorage에 저장되는 모든 문자열(스캔 결과, 구매 기록, 설문)은
한국어 원본으로 저장한다. 조립 시점에 번역하면 "중국어로 스캔 → 한국어 모드에서도
중국어 표시" 같은 언어 혼입이 발생한다 (실제 발생했던 버그).

## 2. 모듈 구조

```
lib/
├── i18n/
│   ├── core.ts      # React 무의존 코어 — 어디서든 import 안전 (워커·서버·lib)
│   ├── en.ts        # export const EN: Record<string,string>  (692 항목)
│   ├── ja.ts        # export const JA  (692)
│   └── zh.ts        # export const ZH  (692, 간체)
└── i18n.tsx         # React 바인딩 — LanguageProvider, useLang
app/components/
└── language-switcher.tsx  # 우측 상단 고정 선택기
```

### 2.1 `lib/i18n/core.ts` (React-free)

```ts
export type Lang = "ko" | "en" | "ja" | "zh";
export const LANGS: { code: Lang; label: string }[];   // 한국어/English/日本語/中文
export const LANG_STORAGE_KEY = "aru.lang";

let currentLang: Lang = "ko";          // 모듈 싱글턴
export function getLang(): Lang;
export function setCurrentLang(lang: Lang): void;      // Provider만 호출
export function isLang(v: unknown): v is Lang;
export function t(msg: string, params?: Record<string, string | number>): string;
```

- `t()` 로직: `lang === "ko"` → 원문 반환. 아니면 `DICTS[lang][msg] ?? msg` 후 `{key}` 치환
- **React 무의존인 이유**: `lib/skin.ts`는 스캔 웹워커에서, `lib/recommend.ts`는 API 라우트에서 import됨. React가 딸려 들어가면 워커 번들 오염/서버 오류. 서버·워커에서는 싱글턴이 `"ko"`라 항상 한국어 → 안전

### 2.2 `lib/i18n.tsx` (React 바인딩)

```tsx
export function LanguageProvider({ children }): JSX.Element;
export function useLang(): { lang: Lang; setLang: (l: Lang) => void };
```

- 언어 상태는 **`useSyncExternalStore`** 로 구독:
  - `getSnapshot` → localStorage(`aru.lang`) + 메모리 폴백(프라이빗 모드 대비)
  - `getServerSnapshot` → 항상 `"ko"` → **SSR/하이드레이션 안전** (서버는 한국어 렌더, 클라이언트에서 저장 언어로 1회 재렌더)
  - 변경 전파: `setLang()` → localStorage 기록 + `window.dispatchEvent(new Event("aru:lang-change"))`
- **`key={lang}` 서브트리 리마운트**: Provider가 자식을 `<Fragment key={lang}>`로 감싸 언어 변경 시 전체 리마운트 → 모든 컴포넌트가 **컨텍스트 구독 없이** 평범한 `t()` 호출만으로 새 언어 반영. 마이그레이션 비용 최소화의 핵심
- 렌더 직전에 `setCurrentLang(lang)` 호출로 싱글턴 동기화 → 렌더 중 실행되는 lib 코드(`recommend()` 등)도 올바른 언어 사용
- `document.documentElement.lang`을 `ko|en|ja|zh-CN`으로 갱신

초기 이펙트 기반 구현은 `react-hooks/set-state-in-effect` lint 위반이라
`useSyncExternalStore`로 교체됨 (smoke 게이트에서 검출).

### 2.3 `LanguageSwitcher`

- `position: fixed; top:10; right:10; z-index:90` — 전 페이지 공통, layout.tsx에서 Provider와 함께 장착
- 스케치 스타일 필(pill) + 드롭다운. 외부 클릭 시 닫힘(`pointerdown` 리스너)
- `role="listbox"/"option"`, `aria-selected` 접근성 처리

## 3. 사전(Dictionary) 규약

- 키 = **코드에 등장하는 한국어 원문 그대로** (플레이스홀더 포함): `"고마워요. {count}번째 피부 피드백이에요."`
- 개행 포함 키는 `\n` 이스케이프 그대로 매칭: `"차분하고\n편안한 결"`
- 브랜드/제품명은 공식 로마자 표기: 라운드랩→Round Lab, 코스알엑스→COSRX, 아누아→Anua, 뷰티오브조선→Beauty of Joseon, 넘버즈인→numbuzin …
- 도메인 용어 통일: 어성초→Heartleaf/ドクダミ/鱼腥草, 시카→Cica/シカ/积雪草, 결→texture/キメ/纹理, 유분→oil/皮脂/油分
- **일본어 피부타입 주의**: 脂性肌·乾燥肌 등이 이미 肌를 포함 → `{type} 피부` 계열 ja 번역은 肌를 덧붙이지 않음 (`{type}肌` 금지 — 脂性肌肌 버그 이력)
- 가격: `{n}만원` → `₩{n}0,000` / `{n}万ウォン` / `{n}万韩元`. 통화 환산 없음

### 커버리지 검증

msgid 추출(정규식 `t("...")` 스캔) → 3개 사전과 대조, 누락 0 확인:

```bash
grep -rhoP '(?<![A-Za-z])t\(\s*"[^"]+"' app lib --include='*.tsx' --include='*.ts' \
  | sed -E 's/^t\(\s*"//; s/"$//' | sort -u > msgids.txt
# scratchpad/check-dicts.mjs 로 사전 3개와 diff → missing: 0 이어야 함
```

## 4. 번역 적용 패턴

| 상황 | 패턴 |
|---|---|
| 정적 JSX 텍스트 | `{t("다시 찍기")}` |
| 속성 (aria-label, placeholder, alt) | `aria-label={t("언어 선택")}` |
| 보간 | `t("필수 항목 {done}/3", { done })` |
| 한국어 데이터 값 렌더 | `{t(sku.name)}`, `{t(concern)}` — 데이터는 그대로, 표시부만 감쌈 |
| 보간값 자체가 한국어 데이터 | `t("{type} 피부", { type: t(survey.type) })` — 안쪽도 번역 |
| `<br/>` 분할 텍스트 | 세그먼트별 개별 `t()` |
| lib에서 조립되는 문장 (렌더 시점 실행) | `recommend.ts` reasonFor 등 — 조립부에서 `t()` (클라이언트 렌더 중 호출되므로 안전) |
| **영속 저장되는 조립 문장** | 조립부는 한국어 원본, 렌더에서 재조립 번역 (`localizedNarrative` §6) |

### 감싸지 않는 것
- 로직 비교값 (`=== "지성"`), localStorage 키, funnel 이벤트명, console, URL, CSS
- 동의 감사 기록 문구 (`lib/consent.ts`) — 컴플라이언스 원문 보존
- 리인게이지 이메일 (`lib/reengage.ts`) — 서버 크론, 클라이언트 언어 미상

## 5. API 변경

### `POST /api/reason` — LLM 추천 이유

```ts
// 요청에 lang 추가
{ items: Item[], lang?: "ko" | "en" | "ja" | "zh" }
```

- 시스템 프롬프트가 `반드시 ${langName}로 1문장씩` 생성하도록 분기. 금지 표현(진단·치료·개선·완화·효능·효과·보장 + 각 언어 동등 표현) 명시
- 후처리: `efficacyClean(candidate).ok` 실패 또는 응답 불량 시 `item.fallback`(클라이언트가 현재 언어로 번역해 보낸 템플릿 문장) 사용
- 호출부: `app/report/page.tsx` → `body: { items, lang: getLang() }`

### `POST /api/analyze` — 비전 분석 (변경 없음, 의도적)

한국어 고정 생성 유지. `efficacyClean` 금지어 필터가 한국어 기반이라 비한국어 생성은
컴플라이언스 게이트를 우회하게 됨. 비한국어 표시는 §6의 템플릿 재조립이 담당.

## 6. 언어 혼입 버그 수정 (PR #33 핵심)

### 문제
`SkinReads`(headline·narrative·extras·retakeReasons·신호 label/detail)가
**조립 시점에 `t()`로 번역된 채** `aru_last_result`(localStorage)와 세션 스토리지에 저장됨.
중국어 상태로 스캔 → 문자열이 중국어로 영속 → 한국어 전환 후에도 중국어 표시.
렌더부의 `t(stored)`는 이미 번역된 문자열이라 사전 매칭 실패 → 그대로 통과.

### 수정
1. `lib/skin.ts` 조립부의 `t()` 전부 제거 → **한국어 원본 저장**
2. 렌더부는 기존 `t(...)` 래핑 유지 → 저장된 한국어를 현재 언어로 번역
3. **narrative 예외 처리**: narrative는 부품 3개를 조합한 완성 문장이라 문장 전체가 사전 키가 아님 →
   ```ts
   // lib/skin.ts
   export function localizedNarrative(
     reads: Pick<SkinReads, "oil" | "redness" | "pores"> & { narrative?: string }
   ): string
   ```
   - ko 모드 + 저장 narrative가 한국어면 → 저장값 그대로 (비전 API가 덧붙인 뉘앙스 보존)
   - 그 외 → **버킷 레벨 값에서 부품을 현재 언어로 재조립**
   - 사용처: `app/report/page.tsx`, `app/scan/result-card.tsx`
4. 유사 계열 정리: `lib/report-trust.ts`의 신호 라벨 `.includes("빛")` 매칭이 번역된 라벨에서 깨지던 문제 → 신호 label/detail도 한국어 원본 저장으로 회귀
5. 사전 누락 보강: overall 값(재촬영 권장/균형 관리 필요/대체로 안정), 신호 체크 문자열(조명 확인/보류 등)

### 잔여 한계
릴리스 전에 이미 저장된(번역된) localStorage 데이터는 소급 수정하지 않음 — 재스캔 시 자연 해소.

## 7. 리포트 3단계 플로우 (PR #33)

```ts
type ReportStep = "analysis" | "picks" | "routine";
const steps: ReportStep[] = reads ? ["analysis", "picks", "routine"] : ["picks", "routine"];
```

- 클라이언트 상태 `stepIndex` — 라우트 분리 없음(입력 데이터 공유·재계산 회피), 단계 전환 시 `window.scrollTo(0)`
- 단계 매핑:
  - `analysis`: 헤드라인·narrative·ConfidenceBridge·ScanHistoryStrip·피부 분석 카드
  - `picks`: 추천 기준·비고(note)·추천 제품·제품 비교 + **구매 스티키바 (이 단계 한정)**
  - `routine`: 오늘의 루틴(아침/저녁)·캘린더 리마인더·후속 연결(케어/카드 스튜디오/이메일 리마인드)
- 상단 탭: `role="tablist"`, `1. 피부 분석 / 2. 추천 제품 / 3. 오늘의 루틴` — 자유 이동 허용
- 하단 내비: `← 이전` / `다음: {다음 단계명} →`
- 헤드라인: 첫 단계는 스캔 헤드라인(또는 `{type} 피부를 위한 리포트`), 이후 단계는 단계명

## 8. 설문·예산 변경 (PR #33)

```ts
// app/survey/page.tsx — 칩은 밴드 상한(ceiling) 저장
const BUDGETS = [
  { label: "1만원", won: 19000 },
  { label: "2만원", won: 29000 },
  { label: "3만원", won: 39000 },
  { label: "4만원", won: 49000 },
  { label: "5만원 이상", won: 999999 },
];

// lib/recommend.ts
export function budgetLabel(won: number): string {
  if (won >= 50000) return t("5만원 이상");
  return t("{n}만원", { n: Math.max(1, Math.floor(won / 10000)) });
}
```

- 상한 저장 이유: `price <= budget` 필터와 라벨 밴드가 일치해야 거짓 "예산 완화" 안내가 안 뜸 (기존 설계 유지)
- 구버전 저장값(예: 19000)도 `floor`로 "1만원"에 정확히 매핑 — 마이그레이션 불필요
- "피하고 싶은 성분" 섹션의 `hint="화해 주의 성분 기준"` 제거
- 테스트 갱신: `tests/recommend.test.ts` budgetLabel 케이스 5종

## 9. 오버플로 방지 (PR #33)

```css
/* app/globals.css */
body { word-break: keep-all; overflow-wrap: break-word; }
button, a { overflow-wrap: break-word; word-break: keep-all; min-width: 0; }
p, h1, h2, h3, span, small, label { overflow-wrap: break-word; }
```

- `keep-all`: 한국어 어절 단위 줄바꿈 유지 (CJK는 자연 분절)
- `overflow-wrap: break-word`: EN 장단어가 고정폭 카드를 뚫는 것 방지
- `min-width: 0`: flex 자식 텍스트가 컨테이너 밖으로 밀려나지 않게 축소 허용
- 홈 헤더: `paddingRight: 118` — 고정 스위처와 태그라인 충돌 방지
- 단계 탭: `ellipsis` 처리로 언어별 길이 차 흡수

## 10. 테스트 & 게이트

| 게이트 | 내용 |
|---|---|
| `npm run smoke` | eslint + next build + 전 라우트 응답 검사 |
| `npm test` | vitest 95개 (recommend/budgetLabel/efficacyClean/camera-quality 등) — 기본 언어 ko라 한국어 어서션 그대로 유효 |
| 사전 커버리지 | 추출 msgid 692개 × 3개 언어, 누락 0 |
| 수동 브라우저 | 언어 4종 전환·유지, 혼입 재현 시나리오(ja 리포트 생성→ko 전환), 단계 플로우, 오버플로 |

### 회귀 주의점 (새 코드 작성 시)
1. 새 사용자 대면 문자열 → `t()` 래핑 + **3개 사전 동시 추가**
2. localStorage/DB에 들어가는 문자열 → 반드시 한국어 원본 (조립부 `t()` 금지)
3. 한국어 문자열 `.includes()` 매칭 로직 → 번역된 값이 들어올 수 있는지 확인
4. 일본어 `{type}` 패턴에 肌 덧붙이지 않기
