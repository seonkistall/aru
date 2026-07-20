# Build Log

## Project
- Project name: ARU (아루) — 30-second AI skin scan that honestly picks your K-beauty routine
- Track: Apps for Your Life
- User and problem: K-뷰티 제품을 고르고 싶은 개인(국내 + 한국 방문 외국인). 성분·효능 정보 과잉과 과장 광고 속에서 "지금 내 피부에 뭘 써야 하는지"를 30초 만에, 의료 클레임 없이 정직한 근거와 함께 알려주는 앱이 없다.

## Initial Brief
- Goal: 셀피 30초 스캔 → 보이는 피부 신호(유분·붉은기·결)만 정직하게 읽기 → 설문과 결합해 제품 후보 3개 + 아침/저녁 루틴 제시 → 구매·상담·2/4주 체크인까지 잇는 완결 루프.
- Context: Next.js 16 + MediaPipe Face Landmarker(온디바이스) + Supabase(연구 동의 데이터) + OpenAI/Gemini 비전 교차확인. 5개 언어(KO/EN/JA/ZH/AR, 기본 EN, 아랍어 RTL).
- Constraints: ① 의료 진단·효능 클레임 금지(효능 필터 `efficacyClean()` + 언어별 금지어 정규식이 AI 출력까지 게이트) ② 기본 스캔은 온디바이스 처리, 원본 사진 무저장 ③ 동의 2분리(AI 분석 전송 / 학습용 크롭 저장) ④ 모든 화면 44px 터치 계약.
- Done when: 핵심 여정(홈→스캔→설문→리포트→케어→체크인)이 실기기 모바일 브라우저에서 끝까지 동작하고, smoke(린트+빌드+테스트+라우트)와 프로덕션 카나리가 그린.

## Key Delegations
### Delegation 1 — 카메라 품질 게이트 재설계
- Purpose: 안드로이드 세로 스트림에서 자동촬영이 영구 실패하는 문제 해결.
- Request: "중앙/거리 게이트가 폰에서 통과 불가. 좌표계·임계값 전면 조사 후 재설계."
- Result: cover-crop 좌표 변환의 취약성을 확인하고 중앙·거리를 차단 조건에서 제거(안내용으로 강등), 원시 얼굴박스 기반 종횡비-무관 게이트로 교체. `/scan?debug=1` 진단 오버레이 추가.
- Next human decision: 실기기 스크린샷으로 최종 검증할 것(임계값 추측 반복 금지 원칙 채택).

### Delegation 2 — 다국어 i18n 코어와 사전 4종
- Purpose: 글로벌 검증(외국인 K뷰티 수요)을 위한 KO/EN/JA/ZH → 이후 AR(RTL) 확장.
- Request: "한국어 원문을 msgid로 쓰는 gettext식 코어, 저장은 한국어 canonical·번역은 렌더에서."
- Result: `lib/i18n/core.ts` + 사전 4종(약 890항목×4), 언어별 클레임 필터, 9 route × 5 locale × 4 viewport 텍스트핏 자동 회귀 180조합.
- Next human decision: 언어별 어투(일본어 정중체, 아랍어 표준 문어) 및 기본 언어를 영어로 전환하는 제품 결정.

### Delegation 3 — 프로덕션 경화 트랙
- Purpose: 출시 전 보안·데이터 경계 완성.
- Request: "RLS·CSP·rate limit·동의 스코프를 적대적으로 헌트하고 각 발견을 회귀 테스트로 고정."
- Result: 무인증 이메일 릴레이·동의 스코프 우회 등 실결함 다수를 배포 전에 수정, Supabase 9테이블 RLS + 브라우저 역할 권한 철회, 테스트 285개+모바일 E2E로 고정.
- Next human decision: Vercel 시크릿 등록, Supabase 프로덕션 마이그레이션 실행 승인.

## Failure & Recovery
- What failed: 안드로이드 자동촬영을 임계값 튜닝으로 두 번 고치려다 두 번 실패. 이후 실기기 `?debug=1` 데이터로 **MediaPipe GPU 델리게이트가 손상 랜드마크(값 ~1e34)를 출력**하는 것이 근본 원인임을 확인.
- Why it failed: 카메라/ML 버그를 기기 실데이터 없이 데스크톱 재현만으로 추정했기 때문. 입력 데이터 오염을 임계값 문제로 오진.
- How we changed the approach: ① 얼굴박스가 [0,1]을 벗어나면 GPU 손상으로 판정하고 CPU 델리게이트로 1회 자동 전환하는 자가복구를 구현 ② "카메라/ML 버그는 실기기 debug 데이터 없이 임계값 추측 금지"를 팀 원칙으로 채택 ③ 취약했던 좌표 수학을 `lib/scan-geometry.ts`로 추출해 단위테스트화. 유사 사례: 전역 `keep-all`이 일본어/중국어 줄바꿈을 전부 금지하던 CJK 랩핑 버그, 아랍어 RTL에서 진행 화살표가 역방향을 가리키던 버그 — 모두 재현 → 회귀 테스트 → 최소 수정 순서로 해소.

## Verification
- Tests and checks: Vitest 293개(58파일) + Playwright 모바일 E2E 42개 + `npm run smoke`(ESLint·프로덕션 빌드·TypeScript·ML py_compile·라우트/API 가드). 언어 사전 커버리지·클레임 필터·동의 스코프·RLS 경계가 전부 자동 회귀로 고정.
- Working user flow: 홈 → 30초 스캔(자동촬영) → 설문 → 3단계 리포트(분석/추천/루틴) → 케어(구매·상담 연결) → 2/4주 이메일 체크인. 프로덕션(https://aru-beauty.vercel.app)에서 전 라우트 카나리 통과.
- Known limitations: 실기기 카메라 매트릭스(조명 5조건) 일부 미완, 이메일 실발송은 Resend 도메인 인증 대기, Play 스토어는 계정 신원확인 게이트 대기.

## Human Decisions
- What Codex handled: 기능 구현 라운드(카메라 게이트·i18n·커머스 아웃링크·리포트 UI), 버그 헌트 실행, 테스트 작성, 문서화. (저장소의 `codex/*` 브랜치 40여 개가 세션 단위 작업 이력)
- What people decided: ① "스캔은 훅, 구매 순간이 상품" 전략 피벗과 수작업 컨시어지 우선 순서 ② 의료 경계·동의 설계·효능 클레임 금지 불변식 ③ 기본 언어 영어 전환·아랍어 추가 등 시장 방향 ④ 머지·배포·마이그레이션 실행 승인(전부 오너 게이트) ⑤ SCIN 데이터셋 라이선스 검토와 채택.
