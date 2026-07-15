# ARU 출시 준비 상태

최종 갱신: 2026-07-16

제품 계약: [PRD.md](PRD.md)

출시 절차: [production-release-checklist.md](production-release-checklist.md)

이 문서는 완료를 주장하는 릴리스 노트가 아니라, 재현 가능한 증거와 외부 차단 조건을 분리하는 현재 상태판이다. 제품 범위·지표·보존 정책은 PRD만 단일 기준으로 사용한다.

## 현재 판정

| 영역 | 상태 | 근거/다음 게이트 |
|---|---|---|
| 소비자 Web 코드 | 로컬 코드 검증 완료 | `npm run smoke` 통과; production canary 필요 |
| 보안·데이터 경계 | 코드 완료, 운영 확인 필요 | RLS/권한 회귀 테스트 완료; production schema 적용·service-role dry-run 필요 |
| 모바일 UI/UX | 로컬 QA 완료 | 390×844 홈·리포트·케어 오버플로 0, 핵심 터치 영역 44px 이상; 배포 후 재검증 필요 |
| 카메라 | Android 기본 흐름 PASS, ROI 매트릭스 미완료 | Galaxy S25 Edge 권한·미러링·촬영·재촬영 사용자 확인 완료; 조도/반사/가림 조건과 iPhone 실기기 필요 |
| 이메일 | 코드 완료, 실발송 미검증 | 검증 도메인·수신 주소·Resend production key 필요 |
| Android TWA/AAB | 미착수 | manifest/service worker/asset links/package/signing/내부 트랙 필요 |
| Google Play | 차단 | 실제 개발자 정보, 지원 이메일, signing certificate, Data safety와 Console 접근 필요 |

## 이번 production-readiness 트랙에서 완료한 코드

- Supabase 앱 테이블 RLS 활성화, 브라우저 역할 직접 권한 철회와 회귀 검증
- `/api/analyze`, `/api/reason` body 크기·스키마·rate·timeout 경계
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

## 현재 제품 흐름

- 카메라: `/` → `/scan` → `/survey` → `/report` → `/care` 또는 `/studio`
- 설문 전용: `/` → `/survey` → `/report` → `/care` 또는 `/studio`
- 연구 운영: 명시적으로 허용된 환경의 `/pilot` → `/ops` → `/eval`
- 이메일: opt-in subscribe → 2주/4주 cron → 서명 unsubscribe → 30일 뒤 cleanup

상세 구조와 데이터 경계는 [architecture.md](architecture.md)를 참고한다.

## 검증 원칙

### 최신 로컬 증거

- 2026-07-16 `npm run smoke` 통과
- Vitest 42개 파일, 219개 테스트 통과
- ESLint, Next.js 16.2.9 production build와 TypeScript 통과
- ML Python script compile 통과
- `/scan`, `/privacy`, `/api/out`, `/api/sync` smoke 통과
- production 기본 차단 대상 `/pilot`, `/ops`, `/eval` 404 확인
- 인증 없는 `/api/sync` POST 401 확인

코드 변경 묶음은 다음 순서를 따른다.

1. 재현 또는 계약 테스트를 먼저 실패시킨다.
2. 최소 구현으로 대상 테스트를 통과시킨다.
3. 전체 테스트, lint, production build와 `git diff --check`를 통과시킨다.
4. 모바일 뷰포트와 브라우저 오류를 확인한다.
5. production 배포 뒤 동일한 핵심 여정을 canary로 다시 확인한다.

실행 명령:

```bash
npm test
npm run lint
npm run build
npm run smoke
```

실제 단말, 외부 provider, Vercel/Supabase/Resend와 Play Console 결과는 로컬 테스트로 대체하지 않는다.

## 출시 전 남은 필수 작업

### P0 — Web production

- production Supabase에 최신 `supabase/schema.sql` 적용
- `anon`/`authenticated` 거부와 service-role sync dry-run 확인
- Vercel secrets·allowed origins·firewall/rate limits·비용 경보 확인
- 실제 Resend 수신, 해지 링크, 철회 후 cron 제외와 만료 cleanup 확인
- production URL에서 주요 페이지·API·MediaPipe asset canary 수행

### P0 — Physical-device camera

- Galaxy S25 Edge에서 정면광, 저조도, 직접 반사, 렌즈 오염, 한쪽 볼 가림과 background/resume 기록
- Android Chrome과 TWA의 품질 게이트 결과가 같은지 확인
- iPhone Safari에서 권한 거부/허용, 미러링, 자동·수동 촬영, 회전, 재촬영과 설문 fallback 확인
- [mobile-camera-qa.md](mobile-camera-qa.md)의 필수 행과 증거를 채우기

### P0 — Android/Play

- production application ID와 release signing certificate 확정
- 설치 아이콘·maskable icon, service worker/offline 정책, Digital Asset Links 구현
- TWA back/navigation bar/orientation/camera/외부 링크 QA
- AAB release build와 Play internal testing, pre-launch report 통과
- 개인정보처리방침, Data safety, 카메라 권한, 콘텐츠 등급과 스토어 문구를 실제 제품과 일치시키기

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
