# 아루 ARU — 작업 상황 (STATUS)

> 최종 업데이트: **2026-07-08** · 버전: **v0.6.9** · 브랜치: `main` · 도식: [`architecture.md`](architecture.md) · 실행 큐: [`AUTOPILOT.md`](../AUTOPILOT.md)

## 제품 정체성
**셀피 → 피부 분석 → 화장품·루틴 추천** 앱. 브랜드명 **아루(ARU)** = Areumdaum + Routine + U. 구 브랜드 `gyeol`의 내부 키(`gyeol_*`)는 데이터 호환을 위해 유지한다.

이 제품은 **K뷰티 피부분석/추천** 제품이다. 다른 소셜앱이나 블로그 서비스와 혼동하지 않는다.

코드 수정 시 `AGENTS.md`의 Next.js 주의사항을 먼저 따른다. 이 레포는 Next.js 기반이지만 현재 버전의 API와 파일 구조가 일반적인 기억과 다를 수 있으므로, 관련 가이드를 `node_modules/next/dist/docs/`에서 확인한다.

## 전략
- **여성-우선 국내 MVP**로 시작한다.
- 카메라 피부 스캔은 획득 훅이자 숏폼 공유 루프의 중심이다.
- 북극성은 **외국인 대상 K뷰티 컨시어지**다.
- 설계 문서는 `~/.gstack/projects/aru/`에 있다.

## 현재 버전 — v0.6.9
- **촬영 옵션 UX 정리**: 자동 촬영, AI 분석 전송, 연구용 학습 crop 저장을 하나의 촬영 옵션 패널로 묶었다.
- **측정영역 게이트 정합**: `측정영역` 체크가 준비되지 않으면 수동 버튼과 자동 촬영이 모두 대기한다.
- **스캔 가이드 안정화**: cover-crop 보정 후 contour/debug 점이 화면 밖으로 튀지 않도록 overlay 좌표를 제한한다.

## 최근 완료 이력
1. **v0.6.9** (2026-07-08) — Scan UX controls + guide gate cleanup
   - 촬영 옵션 패널을 별도 컴포넌트로 추출.
   - 측정영역 준비 전 촬영 버튼과 자동 촬영을 차단.
   - 불필요한 `qualityPassed` 래퍼 제거.
2. **v0.6.8** (2026-07-07) — Adaptive skin ROI guide polish
   - 얼굴 크기에 따라 ROI 가이드 패딩과 영역 크기를 비례값으로 조정.
   - 좌우 볼 위치를 명시적 랜드마크 그룹으로 계산하도록 변경.
   - 가이드 영역 테스트 추가.
3. **v0.6.7** (2026-07-07) — Strict scan gate
   - `face + centered + distance + brightness + noGlare + steady`를 모두 통과해야 수동 촬영 버튼과 자동 촬영 countdown이 시작된다.
   - balanced/tone 모드에서도 움직임을 필수 차단 조건으로 적용.
4. **v0.6.6** (2026-07-07) — Camera quality upgrade + crop/model path hardening
   - 고해상도 카메라 우선 요청과 legacy fallback을 분리.
   - AI 전송 crop과 학습 저장 crop의 품질·용도 경로를 정리.
   - localStorage quota와 Supabase 5MB sync cap 리스크를 UI 흐름에서 사전 처리.
5. **v0.6.5** (2026-07-07) — Moongi cosmetic character
   - Moongi cosmetic helper 캐릭터와 앱 아이콘을 전면 적용.
   - 레이아웃, 추천 알고리즘, ML/카메라 로직, 커머스 플로우는 변경하지 않음.
6. **v0.6.4** (2026-07-07) — Camera ML 데이터 루프 강화 + 배포 복구
   - 동의가 실제 저장된 경우에만 AI 분석 전송과 학습 crop 저장을 허용.
   - 저신뢰/재촬영/판독불가 샘플을 calibration·training 기본 제외 대상으로 정리.
   - Vercel framework/output 설정을 복구하고 `/`, `/scan` 200 OK를 확인.

## 현재 상태
- 스택: Next.js 16.2.9 + React 19.2.4 + Tailwind CSS 4 + MediaPipe + Supabase
- 비전 분석: Gemini/OpenAI 선택 가능. API 키가 없으면 온디바이스 휴리스틱으로 폴백한다.
- 배포: **Vercel 라이브** https://aru-beauty.vercel.app (`aru-beauty`)
- 브랜치: `main`, `origin/main`과 동기화됨
- 워크트리: 깨끗함
- 최신 커밋: 배포 전 로컬 변경분 포함 예정

## 검증
- 2026-07-08 실행: `npm run smoke` 통과
  - ESLint 통과
  - Vitest 22 files / 92 tests 통과
  - Next production build 통과
  - ML Python scripts `py_compile` 통과
  - Smoke routes 통과: `/scan`, `/privacy`, `/pilot`, `/ops`, `/eval`, `/api/out`, `/api/sync`
- 2026-07-08 라이브 확인
  - `https://aru-beauty.vercel.app/` → 200
  - `https://aru-beauty.vercel.app/scan` → 200

## 다음 필요한 작업

### P0 — 실기기 스캔 QA
- **목표**: v0.6.8의 strict gate와 adaptive ROI guide가 실제 모바일 카메라에서 너무 빡빡하거나 느슨하지 않은지 확인한다.
- **해야 할 일**: `docs/mobile-camera-qa.md` 기준으로 iPhone Safari, Android Chrome, 노트북 카메라 최소 3조합을 점검한다.
- **완료 기준**: `/scan?debug=1`에서 face, centered, distance, brightness, glare, steady, ROI가 의도대로 표시되고 자동/수동 촬영이 동일 기준으로 통과한다.

### P0 — 골든셋 10장 확보
- **목표**: 카메라 휴리스틱 변경이 개선인지 퇴행인지 수치로 비교할 최소 데이터셋을 만든다.
- **해야 할 일**: `docs/golden-set.md` 기준으로 피부 톤, 조명, 반사, 거리 조건이 다른 첫 10장과 기대 판정 JSONL을 수집한다.
- **완료 기준**: `/eval`에서 현재 파이프라인 결과와 baseline diff를 볼 수 있다.

### P1 — 골든셋 회귀 하네스 고정
- **목표**: ROI/threshold 변경 전후를 사람이 눈으로만 판단하지 않게 만든다.
- **해야 할 일**: `/eval`의 baseline export/import 흐름을 README와 `docs/golden-set.md`의 절차에 맞춰 점검한다.
- **완료 기준**: 새 baseline 생성, 이전 baseline과 diff, 변경 건수 표시가 한 번에 재현된다.

### P1 — 30명 파일럿 준비
- **목표**: B1 QA 통과 후 바로 참가자 수집을 시작할 수 있게 한다.
- **해야 할 일**: `docs/pilot-ml-loop.md`와 `docs/pilot-participant-kit.md`를 기준으로 모집 문구, 동의서, P001-P030 운영 절차를 확정한다.
- **완료 기준**: `/pilot`에서 참가자 세션 생성, `/ops`에서 label/crop/consent 집계, export가 정상 동작한다.

### P1 — Supabase sync 리허설
- **목표**: 파일럿 데이터를 로컬에만 묶어두지 않고 서버로 안전하게 올릴 수 있는지 확인한다.
- **해야 할 일**: staging 또는 dev Supabase에서 `supabase/schema.sql` 적용 후 `npm run supabase:check`와 `/api/sync` POST dry-run을 실행한다.
- **완료 기준**: consent_events, labels, crop metadata가 batch upload되고 rate limit/token rejection이 의도대로 동작한다.

### P2 — 커머스 제휴 링크 준비
- **목표**: 추천 결과가 실제 커머스 아웃링크/제휴 실험으로 이어지게 한다.
- **해야 할 일**: `docs/commerce-partnership-playbook.md` 기준으로 1순위 파트너와 링크 구조를 정하고 `COMMERCE_LINK_OVERRIDES_JSON` 샘플을 만든다.
- **완료 기준**: `/api/out` 클릭 추적과 merchant override가 smoke 가능한 상태다.

### P2 — 문서/버전 정합성 정리
- **목표**: 제품 버전 표기가 README, STATUS, package metadata에서 어긋나지 않게 한다.
- **해야 할 일**: `package.json`의 `version`이 앱 릴리즈 버전과 다른 의도인지 확인한다.
- **완료 기준**: 의도된 npm/package 버전 정책을 README 또는 STATUS에 명시하거나 `package.json`을 릴리즈 버전에 맞춘다.

## 관련 문서
`README.md` · `AGENTS.md` · `docs/mobile-camera-qa.md` · `docs/golden-set.md` · `docs/pilot-ml-loop.md` · `docs/pilot-participant-kit.md` · `docs/supabase-sync-runbook.md` · `docs/commerce-partnership-playbook.md`
