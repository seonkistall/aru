# 아루 ARU

ARU는 선택형 온디바이스 카메라 관찰과 짧은 설문으로 K-뷰티 제품 후보와 일상 루틴을 제안하는 모바일 우선 웹앱입니다. 카메라 없이 설문만으로도 사용할 수 있으며, 의료 진단·치료 서비스가 아닙니다.

- 라이브: https://aru-beauty.vercel.app
- 제품 범위와 성공 지표: [docs/PRD.md](docs/PRD.md)
- 현재 검증 상태와 남은 출시 조건: [docs/STATUS.md](docs/STATUS.md)
- 시스템 구조: [docs/architecture.md](docs/architecture.md)
- 출시 체크리스트: [docs/production-release-checklist.md](docs/production-release-checklist.md)

## 핵심 사용자 흐름

1. 카메라: 홈 → 피부 ROI 품질 게이트 → 촬영/재촬영 → 설문 → 리포트 → 케어/판매처/공유
2. 설문 전용: 홈 → 설문 → 리포트 → 케어/판매처/공유
3. 연구: 내부 파일럿 세션 → 목적별 동의 → 촬영/피드백 → 검토/동기화 → 오프라인 평가

기본 스캔·설문·추천 기록은 브라우저 로컬에 머뭅니다. AI 분석 전송과 학습용 피부 크롭 보존은 별도 동의이며, 파일럿에서는 participant/session이 정확히 일치해야 합니다. 전체 데이터 계약과 보존 기간은 [PRD §7](docs/PRD.md#7-데이터동의보존-계약)을 따릅니다.

## 기술 스택

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS 4와 CSS design tokens
- MediaPipe Tasks Vision — 모델과 WASM same-origin 제공
- 온디바이스 피부 ROI 휴리스틱, 선택형 Gemini/OpenAI 교차 검증
- Supabase Postgres/Storage — server-only sync와 이메일 운영 데이터
- Resend — 명시적으로 구독한 2·4주 리마인더
- Vitest, ESLint, production route/auth smoke

제품 폰트는 npm 패키지로 self-host하는 Pretendard Variable을 본문과 번역 UI에 사용합니다. 한국어의 짧은 브랜드 display에는 OFL-1.1의 Nanum Pen Script 5.2.7만 제한적으로 사용하며, EN/JA/ZH 제목은 읽기 쉬운 Pretendard로 자동 전환합니다. 런타임 폰트 CDN 요청은 없습니다.

## 로컬 실행

Node.js와 Python이 설치된 환경에서:

```bash
npm install
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. 핵심 설문 경로는 외부 키 없이 작동합니다. 선택형 AI 교차 검증, Supabase sync와 이메일 발송은 해당 서버 환경변수가 있을 때만 활성화됩니다.

## 검증

```bash
npm test
npm run test:mobile-ui
npm run lint
npm run build
npm run smoke
npm run android:check
npm audit --omit=dev
git diff --check
```

`npm run test:mobile-ui`는 Playwright Chromium을 사용해 360×800에서 KO/EN/JA/ZH
홈, 카메라 권한 거부 fallback, Studio 편집기, 리마인더와 개인정보 경로의
오버플로·44px 터치 타깃을 검사합니다. 최초 실행 전
`npx playwright install chromium`으로 고정 브라우저를 설치합니다.

`npm run smoke`는 lint, Vitest 전체 테스트, 위 모바일 실렌더 테스트,
Next production build, TypeScript/ML Python compile, 주요 페이지와 인증 경계를
검사합니다. 코드가 통과해도 physical-device, production secret, 이메일 실발송과
Play Console 검증을 대신하지 않습니다.

카메라 변경은 [docs/mobile-camera-qa.md](docs/mobile-camera-qa.md)의 Android Chrome·iOS Safari 실기기 행을 모두 채워야 합니다. 현재 Galaxy S25 Edge 기본 촬영 흐름의 사용자 확인 증거와 추가 ROI 조건은 [docs/STATUS.md](docs/STATUS.md)에 구분해 기록합니다.

## 서버 환경변수

비밀 값에는 절대로 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

```text
# Supabase server-only
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SYNC_TOKEN
SUPABASE_CROP_BUCKET
SUPABASE_CROP_RETENTION_DAYS
SUPABASE_SYNC_ALLOWED_ORIGINS

# Email / scheduled delivery
RESEND_API_KEY
REENGAGE_FROM
REENGAGE_LINK_BASE
UNSUBSCRIBE_SECRET
CRON_SECRET

# Optional AI providers
GEMINI_API_KEY
OPENAI_API_KEY
```

실제 변수 이름과 검증 순서는 [docs/production-release-checklist.md](docs/production-release-checklist.md), [docs/supabase-sync-runbook.md](docs/supabase-sync-runbook.md), [docs/reengage-setup.md](docs/reengage-setup.md)를 확인하세요. 환경변수를 바꾼 뒤에는 새 production deployment가 필요합니다.

## 보안·프라이버시 불변식

- Supabase 앱 테이블은 RLS를 켜고 `anon`/`authenticated` 직접 권한을 철회합니다.
- service-role, sync token, cron/unsubscribe secret과 Resend key는 서버에서만 사용합니다.
- Supabase runtime은 유효한 HTTPS/loopback URL, modern 또는 legacy service-role key, 32자 이상 sync token만 설정 완료로 인정하며 Vercel 마스킹 문자열은 거부합니다.
- `/api/analyze`와 `/api/reason`은 byte·schema·rate·timeout 제한을 통과해야 provider를 호출합니다.
- Vercel Firewall은 `/api/analyze`, `/api/reason`, `/api/reengage/subscribe` POST를 IP당 합산 20회/60초로 제한하며, 각 route의 app-level limiter를 2차 방어로 유지합니다.
- 모든 route는 same-origin asset 정책을 enforced CSP로 적용합니다. Next.js hydration, service worker와 self-hosted MediaPipe는 실제 Chromium 회귀 검증을 통과해야 합니다.
- 카메라 실패나 저장소/네트워크 오류가 설문 추천 경로를 막지 않아야 합니다.
- 판매처 클릭은 구매나 사용으로 기록하지 않습니다. 사용 시작은 사용자의 별도 동작으로만 기록합니다.
- 검증되지 않은 가격·재고·별점·리뷰 수·제휴 배지를 표시하지 않습니다.
- 새 로컬 데이터는 [lib/device-data.ts](lib/device-data.ts)에 등록하고 전체 삭제 경로에 포함합니다.

## 프로젝트 구조

```text
app/                  Next.js 페이지, UI 컴포넌트, API routes
lib/                  카메라/추천/동의/퍼널/저장소 도메인 로직
public/vendor/        self-hosted MediaPipe assets
supabase/schema.sql   production DB 권한·테이블 기준
ml/                   오프라인 calibration/training 도구
scripts/              smoke와 asset 복사/검증
tests/                단위·계약·보안 회귀 테스트
docs/                 PRD, 구조, QA, 운영 runbook
```

카메라와 데이터 흐름의 상세 도식은 [docs/architecture.md](docs/architecture.md)에 있습니다. 코드를 수정할 때는 루트 [AGENTS.md](AGENTS.md)와 관련 계획 문서를 먼저 확인하세요.

## 배포

1. clean install에서 `npm run smoke`를 통과합니다.
2. production Supabase에 `supabase/schema.sql`을 적용하고 브라우저 역할 거부를 재현합니다.
3. Vercel secrets·허용 origin·provider 비용 한도와 live Firewall rule 상태를 확인합니다.
4. 실제 Resend 메일과 서명된 구독 해지·보존 정리를 검증합니다.
5. physical-device 카메라 매트릭스를 완료합니다.
6. production 배포 후 페이지/API/MediaPipe asset canary를 수행합니다.
7. Android TWA/AAB와 Play 선언은 PRD의 별도 출시 게이트를 통과한 뒤 제출합니다.

체크박스와 외부 오너 입력이 남아 있으면 production/Play 준비 완료로 표시하지 않습니다.

## Android TWA와 도메인 연결

`android/`는 `com.seonkistall.aru`가 `https://aru-beauty.vercel.app`만 여는
Bubblewrap 1.24.1 TWA 프로젝트입니다. `npm run android:check`는 package/origin,
API 36, 권한, 버전, 로컬 toolchain과 Git secret 누출을 함께 검사합니다.

- package/version: `com.seonkistall.aru` / `1.1.0 (11000)`
- Android: min SDK 23, compile/target SDK 36, adaptive orientation
- 설치 권한: camera/storage/media/location/microphone/contacts/AD_ID 없음
- 웹 시작 URL: `https://aru-beauty.vercel.app/`
- release signing: ignored keystore와 process 환경변수만 사용
- 산출물: ignored `app-release.aab`, `app-release.apk`

재현 가능한 설정·빌드·검증 명령은
[Android release build runbook](docs/android-build-runbook.md), 최신 해시와 권한·서명
증거는 [Android artifact QA](docs/qa/2026-07-16-android-artifact.md)를 따릅니다.
업로드 키는 Play 등록 전에 반드시 암호화된 외부 저장소에 백업해야 합니다.

업로드 키와 `.env.android.local`은 Git에서 제외됩니다. 현재 공개 upload
certificate fingerprint는 `public/.well-known/assetlinks.json`과
`android/twa-manifest.json`에 동일하게 기록되어 있습니다. Play App Signing을
활성화하면 Play Console이 제공하는 distribution certificate fingerprint를
기존 값에 추가하고 웹을 재배포한 뒤 association을 다시 확인해야 합니다.

## Google Play 제출 자료

`docs/play-store/`에는 ko-KR/en-US 등록정보, Data safety 작업표, 개인정보처리방침
검토, 콘텐츠 등급, reviewer 안내, 릴리스 노트, 내부 테스트 체크리스트가 있습니다.
스토어 아이콘·1024×500 feature graphic과 실제 설문 플로우에서 캡처한
1080×2160 phone screenshot 4장도 같은 폴더에 있습니다.

```bash
npm test -- tests/play-store-pack.test.ts
node scripts/generate-play-assets.mjs
```

Play Console 제출 전에는 실제 개발자/법인명, 공개 지원 이메일, Play App Signing
distribution certificate SHA-256을 입력해야 합니다. 이 세 값은 저장소에서 추측하지
않으며, distribution fingerprint를 `assetlinks.json`에 추가해 production 재배포 후
Galaxy 실기기 TWA에서 주소창이 사라지는지 확인해야 합니다.

## 주요 문서

- [PRD](docs/PRD.md) — 제품 약속, 경계, 데이터, 지표, 출시 게이트
- [Architecture](docs/architecture.md) — 브라우저·API·데이터·ML 구조
- [Status](docs/STATUS.md) — 증거 기반 현재 상태와 차단 조건
- [Production canary](docs/qa/2026-07-19-release-completion-canary.md) — 360px 모바일 UI·API·MediaPipe·Play 준비 상태의 최종 실배포 검증
- [Mobile camera QA](docs/mobile-camera-qa.md) — 실기기 카메라 매트릭스
- [Production release checklist](docs/production-release-checklist.md) — Web production 절차
- [Supabase sync runbook](docs/supabase-sync-runbook.md) — RLS·sync·삭제 운영
- [Re-engagement setup](docs/reengage-setup.md) — Resend·해지·보존
- [Golden set](docs/golden-set.md) — 카메라 판독 회귀 프로토콜
- [Android build runbook](docs/android-build-runbook.md) — TWA 서명 빌드·검증
- [Google Play submission pack](docs/play-store/internal-test-checklist.md) — Console·내부 트랙 게이트
