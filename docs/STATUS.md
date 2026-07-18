# ARU 출시 준비 상태

최종 갱신: 2026-07-19

제품 계약: [PRD.md](PRD.md)

출시 절차: [production-release-checklist.md](production-release-checklist.md)

이 문서는 완료를 주장하는 릴리스 노트가 아니라, 재현 가능한 증거와 외부 차단 조건을 분리하는 현재 상태판이다. 제품 범위·지표·보존 정책은 PRD만 단일 기준으로 사용한다.

## 현재 판정

| 영역 | 상태 | 근거/다음 게이트 |
|---|---|---|
| 소비자 Web 코드 | production 배포·canary 완료 | `npm run smoke`와 10분 production canary 통과; CSP enforcement 후 재검증 포함 |
| 보안·데이터 경계 | CSP·Firewall·DB 권한과 runtime 구성 검증 완료 | production 9개 테이블 RLS와 브라우저 역할 4종 권한 거부, service-role 트랜잭션 rollback, 비공개 bucket 확인; Vercel modern secret의 새 배포 `configured: true` 확인 |
| 모바일 UI/UX | production canary와 렌더링 회귀 완료 | 360×800 KO/EN/JA/ZH callout, 카메라 fallback, Studio, 리마인더·개인정보 경로를 실제 Chromium으로 검증; 44px 미만·offscreen 0 |
| 카메라 | Android 기본 흐름 PASS, ROI 매트릭스 미완료 | Galaxy S25 Edge 권한·미러링·촬영·재촬영 사용자 확인 완료; 조도/반사/가림 조건과 iPhone 실기기 필요 |
| 이메일 | 코드 완료, 실발송 미검증 | 검증 도메인·수신 주소·Resend production key 필요 |
| Android TWA/AAB | 코드·서명 산출물 검증 완료 | API 36 AAB/APK와 upload association 검증; Play distribution certificate·내부 트랙 실기기 QA 필요 |
| Google Play | 제출 패키지 완료, 계정 검증 차단 | ko/en 등록정보·Data safety·등급·reviewer 문서·실제 스크린샷 완료; `Sean_AI` 개발자 신원 확인 미완료로 앱 만들기 비활성화, 결제 계정 긴급 알림 해결 필요 |

## 이번 production-readiness 트랙에서 완료한 코드

- Supabase 앱 테이블 RLS 활성화, 브라우저 역할 직접 권한 철회와 회귀 검증
- `/api/analyze`, `/api/reason` body 크기·스키마·rate·timeout 경계
- enforced CSP와 Vercel Firewall provider 경로 합산 20회/60초 전역 제한
- 파일럿 participant/session 범위 동의 fallback 제거
- MediaPipe 모델/WASM same-origin 제공과 asset smoke
- 리마인더 명시적 구독, 서명·만료 해지, 철회 제외, 30일 보존 정리
- 내부 `/ops`, `/eval`, `/pilot` production 기본 차단
- 전체 기기 데이터 키 등록·삭제 검증
- 추천의 검증되지 않은 별점/리뷰/가격 표시 제거와 판매처 재확인 안내
- 판매처 클릭과 실제 사용 시작 이벤트 분리
- 홈 첫 화면 CTA, 리포트 고정 상업 바 제거, 케어 판매처 접기와 44px 터치 계약
- 설문 조회 이벤트와 세션 기준 설문 완료율 추가
- 제품·데이터·지표·Web/TWA/Play 게이트를 [PRD.md](PRD.md)로 통합
- `com.seonkistall.aru` API 36 TWA, 환경변수 전용 release signing과 Digital Asset Links 구현
- signed AAB/APK의 bundletool·aapt2·APK v1/v2 검증과 권한 감사 완료
- Google Play ko/en 등록정보, Data safety·개인정보·등급·reviewer 작업표와 실제 UI 자산 생성

## 현재 제품 흐름

- 카메라: `/` → `/scan` → `/survey` → `/report` → `/care` 또는 `/studio`
- 설문 전용: `/` → `/survey` → `/report` → `/care` 또는 `/studio`
- 연구 운영: 명시적으로 허용된 환경의 `/pilot` → `/ops` → `/eval`
- 이메일: opt-in subscribe → 2주/4주 cron → 서명 unsubscribe → 30일 뒤 cleanup

상세 구조와 데이터 경계는 [architecture.md](architecture.md)를 참고한다.

## 검증 원칙

### 최신 로컬 증거

- 2026-07-18 `npm run smoke` 통과
- Vitest 52개 파일, 260개 테스트 통과
- Playwright Chromium 360×800 실렌더 회귀 4개 통과
- ESLint, Next.js 16.2.9 production build와 TypeScript 통과
- ML Python script compile 통과
- `npm audit --omit=dev` production 취약점 0건
- `/scan`, `/privacy`, `/api/out`, `/api/sync` smoke 통과
- production 기본 차단 대상 `/pilot`, `/ops`, `/eval` 404 확인
- 로컬 허용 origin 밖의 `/api/sync` POST 403 확인
- Vercel의 `[sensitive]` 마스킹 값과 32자 미만 sync token을 실제 설정으로 오인하지 않는 회귀 테스트 추가
- enforced CSP 아래 Chromium hydration·설문 이벤트·service worker·MediaPipe model/WASM 200, console/network 오류 0 확인
- Vercel Firewall이 AI·구독 provider POST의 21번째 요청부터 429를 반환하는 것 확인
- Supabase production 프로젝트의 9개 앱 테이블에서 RLS 활성화와 `anon`/`authenticated`의 SELECT·INSERT·UPDATE·DELETE 거부 확인
- `service_role` 트랜잭션 insert 후 rollback과 별도 조회 잔여 0, `gyeol-crop-samples` 비공개 bucket 확인
- 새 Production 배포에서 `/api/sync` 구성 플래그 3종 true, 비인증 POST 401과 canonical origin 허용 확인
- 390×844 홈→설문→리포트→케어, 카메라 권한 거부 fallback, 개인정보·해지 화면의 오버플로·콘솔 오류 0 확인
- 360×800 KO/EN/JA/ZH callout, 카메라 fallback, Studio, 리마인더·개인정보 경로를 Playwright 회귀 게이트로 고정
- merge `1e884e6`의 Production 배포 `dpl_3YTFaCFcvjEyWHTWXXmC8PDDPsUr`에서 같은 360px 경로 재검증; console error·runtime error log 0
- same-origin MediaPipe 모델·JS·WASM 200과 `aru-mediapipe-v1` Service Worker 캐시 확인
- Vercel Production 배포의 1시간 error-level runtime log 0건 확인

코드 변경 묶음은 다음 순서를 따른다.

1. 재현 또는 계약 테스트를 먼저 실패시킨다.
2. 최소 구현으로 대상 테스트를 통과시킨다.
3. 전체 테스트, lint, production build와 `git diff --check`를 통과시킨다.
4. 모바일 뷰포트와 브라우저 오류를 확인한다.
5. production 배포 뒤 동일한 핵심 여정을 canary로 다시 확인한다.

실행 명령:

```bash
npm test
npm run test:mobile-ui
npm run lint
npm run build
npm run smoke
```

실제 단말, 외부 provider, Vercel/Supabase/Resend와 Play Console 결과는 로컬 테스트로 대체하지 않는다.

## 출시 전 남은 필수 작업

### P0 — Web production

- production Supabase schema·RLS·직접 권한·비공개 bucket 검증 완료; [운영 증거](qa/2026-07-18-supabase-production.md) 유지
- Supabase modern secret key의 Vercel Production 등록과 새 배포 runtime 구성 확인 완료; `/api/sync` 인증 dry-run과 bucket 접근 canary 수행
- Vercel allowed origins와 새 배포 runtime 확인 완료; AI/Resend 비용 경보 확인
- 실제 Resend 수신, 해지 링크, 철회 후 cron 제외와 만료 cleanup 확인
- production 페이지·API·MediaPipe asset canary 완료; [최신 증거](qa/2026-07-19-release-completion-canary.md) 유지

### P0 — Physical-device camera

- Galaxy S25 Edge에서 정면광, 저조도, 직접 반사, 렌즈 오염, 한쪽 볼 가림과 background/resume 기록
- Android Chrome과 TWA의 품질 게이트 결과가 같은지 확인
- iPhone Safari에서 권한 거부/허용, 미러링, 자동·수동 촬영, 회전, 재촬영과 설문 fallback 확인
- [mobile-camera-qa.md](mobile-camera-qa.md)의 필수 행과 증거를 채우기

### P0 — Android/Play owner gates

- Play Console `Sean_AI` 계정의 개발자 신원 확인과 결제 계정 긴급 문제 해결
- 업로드 키·환경 파일을 암호화된 외부 저장소에 백업
- 실제 개발자/법인명과 공개 지원 이메일을 개인정보처리방침·Console에 입력
- Play App Signing distribution certificate를 Digital Asset Links에 추가하고 재배포
- Galaxy S25 Edge internal-track TWA에서 back/navigation/orientation/camera/외부 링크 QA
- Play internal testing과 pre-launch report를 통과하고 Data safety·등급 작업표를 Console에 확정
- Play 계정 유형·생성일을 확인하고, 2023-11-13 이후 개인 계정이면 모바일 앱 기기 검증과 12명·14일 closed test 후 production access 신청

### P1 — 연구 운영

- 골든셋 최소 10장과 기대 판정 확보
- 동의한 파일럿에 한해 crop 만료·삭제 처리 운영 리허설
- 모델 자동 승격 없이 calibration/평가 결과를 사람이 승인

## 외부 오너 입력

다음 값은 코드에서 추측하거나 임의 생성하지 않는다.

- Play 개발자/법인명과 공개 지원 이메일
- Android application ID, keystore 보관자와 release certificate SHA-256
- Resend 검증 도메인, 발신 주소와 실제 수신 테스트 주소
- production Supabase/Vercel/AI provider 접근과 지출 한도
- 파일럿 데이터 삭제 요청을 처리할 실제 문의 채널

이 입력 또는 실제 콘솔 증거가 없으면 “Web production 완료”나 “Play 제출 가능”으로 표시하지 않는다.
