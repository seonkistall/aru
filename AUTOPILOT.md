# AUTOPILOT — 아루 ARU 자동운항 백로그

> 단일 진실원(SSOT)의 **실행 큐**. 상태 서술은 [`docs/STATUS.md`](docs/STATUS.md), 실행 지시는 여기.
> 최종 갱신: **2026-07-11** · 버전: **v1.1.0** · 브랜치 기준: `main`
> 갱신자: Claude · 근거: `npm run smoke` PASS(2026-07-11), v1.1 글로벌 검증판(PR #32~#40) 배포 반영

## 운항 규칙
- **AUTOPILOT 항목**: 사람 승인 없이 에이전트가 브랜치 따서 실행 → smoke PASS → 커밋. `git push`/배포는 오너.
- **BLOCKER 항목**: CEO(오너) 의사결정 없이는 착수 불가. 아래 결정 1줄 + 해제 조건 충족 전까지 큐에 안 넣음.
- 매 사이클 끝: pm이 이 표와 STATUS `다음(Next)`을 동기화(불일치 0건 목표).
- Gary 기준: 항목마다 **실제 유저 + 수요 증거(관심 아님, 행동)**. 증거 없으면 컷.

## 이번 사이클 기준선 (2026-07-11, 검증 완료)
| 게이트 | 결과 | 증거 |
|---|---|---|
| lint + vitest + build | PASS | `npm run smoke` (vitest 21 files / 93 tests) |
| py_compile (ML 5종) | PASS | prepare_crop_dataset/train_visible_attributes/evaluate_dataset/calibrate/run_pipeline |
| 라우트 7종 | PASS | /scan·/privacy·/pilot·/ops·/eval 200, /api/out 302, GET /api/sync 200, POST /api/sync 403(토큰無 정상 거부) |
| 라이브 배포 | PASS | https://aru-beauty.vercel.app v1.1 전 라우트 200, 언어전환 프로덕션 실검증 |
| i18n 4개국어 | SHIPPED | KO/EN/JA/ZH 사전 694×3, 자동감지+스위처, puppeteer 시각 스윕 7라우트×4언어 |
| 클레임 컴플라이언스 | SHIPPED | efficacyClean()(ko) + 다국어 금지클레임 regex(en/ja/zh) 이중 게이트 |

## AUTOPILOT 큐 (에이전트 자율 실행)
| ID | owner | RICE | 작업 지시문 | 완료조건 | 상태 |
|---|---|---|---|---|---|
| A1 | qa | 8.0 | 매 PR 전 `npm run smoke` 그린 유지. 실패 시 파일:라인 + 실패 로그를 STATUS에 기록 | smoke PASS 로그 첨부 | ✅ 2026-07-11 그린 |
| A2 | eng | 6.5 | v1.1 신규 표면(i18n 불변식·다국어 클레임 필터·언어감지·스튜디오 프리필·저장소 안전) 적대 헌트 → 확정 버그만 수정+테스트 | 확정 발견 0건 또는 전부 수정+smoke 그린 | 🔄 이번 사이클 진행중 |
| A4 | pm | 4.0 | README/STATUS/AUTOPILOT/package 버전 드리프트 정리(v1.1.0) + Next↔AUTOPILOT 동기 유지 | 문서 불일치 0건 | ✅ 이번 사이클 |

## BLOCKER 큐 (CEO 의사결정 필요 — 착수 전 오너 승인)
> 형식: **CEO 결정 1줄** → **해제 조건**(충족되면 AUTOPILOT 큐로 승격).

### B0 — 외국인 테스터 검증 + 수작업 컨시어지 (최우선, 2026-07-08 피벗)
- **실제 유저**: EN/JA/ZH 테스터 + 수작업 판매 대상 10명. **수요 증거**: 인터뷰 10명 중 4~5명 구매 의향(행동 아님) → 실결제로 전환 검증 필요. 현재 캡처 0원.
- **CEO 결정(1줄)**: 이번 주 10명에게 직접 판매(스캔→오너 소싱·주문·정산) 실행 + 스프레드시트(이름/주문/객단가/마진/재구매/안 산 이유) 기록.
- **해제 조건(시드 게이트)**: 결제전환 ≥3/10 + 재구매 ≥1 → B3 제휴 착수. *(코드 작업 아님 — 에이전트 대행 불가.)*
- **준비물(SHIPPED)**: [`docs/concierge-kit.md`](docs/concierge-kit.md)(실행 런북+지표 정의) + [`docs/concierge-tracker.csv`](docs/concierge-tracker.csv)(판매 기록 시트). 다음 세션에 채운 트래커 지참.

### B1 — 모바일 실기기 QA (골든셋 10장 포함)
- **실제 유저**: 오너 본인 + 동의한 내부 인원 3~5명. **수요 증거**: 라이브 배포됐으나 실기기 스캔 정확도·게이트 동작이 **0회 검증** — 파일럿 나가면 재현 불가 리스크.
- **CEO 결정(1줄)**: iPhone Safari + Android Chrome 중 **어느 실기기 조합으로 언제** 돌릴지 + 게이트 통과 기준(오탐 허용선) 승인.
- **해제 조건**: `docs/mobile-camera-qa.md` v0.3 체크리스트 통과 + `docs/golden-set.md` 내부 인원 **첫 10장** 수집(로컬 `ml/data/golden/`, 레포 커밋 금지) → 완료 시 A3 하네스로 재판독 회귀 착수 가능.

### B2 — 30명 파일럿 개시
- **실제 유저**: `P001~P030` 로스터. **수요 증거**: 현재 학습 크롭 0장·라벨 0건 → ML 밴드 콜드. 스캔 정확도 주장 자체가 미검증(데이터 없이 모델 승격 불가).
- **CEO 결정(1줄)**: **모집 채널(내부/지인/모집공고)·예산·동의(PIPA) 서면 사인오프** 승인 — 사람·개인정보 관여라 에이전트 대행 불가.
- **해제 조건**: B1 통과(게이트 신뢰 확보) + 모집 소스 확정 + 동의 문안 최종본 승인 → `/pilot` 세션으로 라벨+동의 크롭 수집 개시(목표 크롭 100+ dry-run, 300+ 학습).

### B4 — 코드 개선 3건 (오너 결정 필요, 2026-07-12 헌트 2라운드 이연)
- **재유입 이메일 3자 등록**: `/api/reengage/subscribe`가 자가신고 consent+스푸핑 가능 per-IP 한도만으로 임의 이메일 등록 허용. 발송은 CRON_SECRET 게이트라 고정 리마인더만 나가지만 스팸-바이-프록시 소지. **CEO 결정**: 더블 옵트인(확인 이메일) 도입 여부.
- **크로스유저 데이터**: 인증 없음 + RLS 비활성. 문서화된 브라우저-Supabase(`NEXT_PUBLIC_SUPABASE_*`) 활성 시 purchases/checkins/care_intents가 전역 공유풀. 현재 admin-sync 모드에선 미발생. **CEO 결정**: 인증 배선 or 로컬-온리 유지.
- **care 로컬 KO/EN 토글**: i18n 이전 유물. 글로벌 4개국어 스위처와 별개로 동작→토글≠앱언어 시 혼합 표시. **CEO 결정**: 로컬 토글 제거하고 글로벌 i18n으로 일원화(외국인 컨시어지 방향과 정합).

### B3 — BD 제휴 (올리브영/브랜드몰)
- **실제 유저**: 커머스 아웃링크 클릭 유저. **수요 증거**: `/api/out` 클릭 추적 인프라는 SHIPPED이나 **딜 0건** → 제휴 딥링크 없이는 수익화·전환 데이터 미확보.
- **CEO 결정(1줄)**: **아웃리치 1순위 파트너 + 커머셜 조건(수수료/딥링크 스펙)** 결정 — 외부 협상이라 에이전트 대행 불가.
- **해제 조건**: 제휴 계약 체결 → 오너가 `COMMERCE_LINK_OVERRIDES_JSON` env로 딥링크 교체(`docs/commerce-partnership-playbook.md`). *(env 반영은 프로덕션 config → 오너 전용.)*

## 다음 사이클 예고
- B0 해제 시 → 컨시어지 트랙션 데이터로 B3 제휴 협상 + `/api/out` 실링크 교체.
- B1 해제 시 → `/eval`로 첫 골든셋 재판독 회귀 리포트 생성.
- B2 해제 시 → `/ops` ML 밴드 추적 + 크롭 카운트 KPI 계기판.
- 상시: smoke 그린 유지(A1), 문서 동기(A4). 오너 트리거 잔여: funnel_events 테이블(schema.sql 재실행)·`?worker=1` 실기기 검증·RESEND/CRON_SECRET 키(재유입 가동).
