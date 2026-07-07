# AUTOPILOT — 아루 ARU 자동운항 백로그

> 단일 진실원(SSOT)의 **실행 큐**. 상태 서술은 [`docs/STATUS.md`](docs/STATUS.md), 실행 지시는 여기.
> 최종 갱신: **2026-07-08** · 버전: **v0.6.9** · 브랜치 기준: `main`
> 갱신자: Codex · 근거: `npm run smoke` PASS(2026-07-08), 스캔 UX/게이트 정합 수정

## 운항 규칙
- **AUTOPILOT 항목**: 사람 승인 없이 에이전트가 브랜치 따서 실행 → smoke PASS → 커밋. `git push`/배포는 오너.
- **BLOCKER 항목**: CEO(오너) 의사결정 없이는 착수 불가. 아래 결정 1줄 + 해제 조건 충족 전까지 큐에 안 넣음.
- 매 사이클 끝: pm이 이 표와 STATUS `다음(Next)`을 동기화(불일치 0건 목표).
- Gary 기준: 항목마다 **실제 유저 + 수요 증거(관심 아님, 행동)**. 증거 없으면 컷.

## 이번 사이클 기준선 (2026-07-08, 검증 완료)
| 게이트 | 결과 | 증거 |
|---|---|---|
| lint + build | PASS | `npm run smoke` |
| py_compile (ML 5종) | PASS | prepare_crop_dataset/train_visible_attributes/evaluate_dataset/calibrate/run_pipeline |
| 라우트 7종 | PASS | /scan·/privacy·/pilot·/ops·/eval 200, /api/out 302, GET /api/sync 200, POST /api/sync 401(토큰無 정상) |
| 라이브 배포 | PASS | https://aru-beauty.vercel.app `/`, `/scan` 200 OK |
| 골든셋 평가 화면 | SHIPPED | `/eval` JSONL export, baseline diff, label accuracy 표시 |
| 스캔 UX/게이트 | PASS | 측정영역 준비 전 촬영 차단 + 촬영 옵션 패널 정리 |

## AUTOPILOT 큐 (에이전트 자율 실행)
| ID | owner | RICE | 작업 지시문 | 완료조건 | 상태 |
|---|---|---|---|---|---|
| A1 | qa | 8.0 | 매 PR 전 `npm run smoke` 그린 유지. 실패 시 파일:라인 + 실패 로그를 STATUS에 기록 | smoke PASS 로그 첨부 | ✅ 이번 사이클 그린 |
| A2 | fe | 6.0 | 헤드리스로 잡을 수 있는 것만: `/scan` 뷰포트·오버레이 좌표 수식 회귀 확인(실기기 아님). PR#13 게이트 좌표 픽스 반영 검증 | 좌표 회귀 0건, 실기기 항목은 B1로 위임 | ✅ 라우트 200·좌표픽스 병합됨 |
| A3 | fe/eng | 5.5 | 골든셋 하네스: `/eval` 재판독 결과 JSONL 저장 + 이전 실행 diff + 정답 라벨 일치율 표시 | JSONL 저장 + diff + accuracy 화면 출력 | ✅ 구현 완료, 이미지 수집은 B1 |
| A4 | pm | 4.0 | README/STATUS/AUTOPILOT/package 버전 드리프트 정리(v0.6.9) + Next↔AUTOPILOT 동기 유지 | 문서 불일치 0건 | ✅ 이번 사이클 |

## BLOCKER 큐 (CEO 의사결정 필요 — 착수 전 오너 승인)
> 형식: **CEO 결정 1줄** → **해제 조건**(충족되면 AUTOPILOT 큐로 승격).

### B1 — 모바일 실기기 QA (골든셋 10장 포함)
- **실제 유저**: 오너 본인 + 동의한 내부 인원 3~5명. **수요 증거**: 라이브 배포됐으나 실기기 스캔 정확도·게이트 동작이 **0회 검증** — 파일럿 나가면 재현 불가 리스크.
- **CEO 결정(1줄)**: iPhone Safari + Android Chrome 중 **어느 실기기 조합으로 언제** 돌릴지 + 게이트 통과 기준(오탐 허용선) 승인.
- **해제 조건**: `docs/mobile-camera-qa.md` v0.3 체크리스트 통과 + `docs/golden-set.md` 내부 인원 **첫 10장** 수집(로컬 `ml/data/golden/`, 레포 커밋 금지) → 완료 시 A3 하네스로 재판독 회귀 착수 가능.

### B2 — 30명 파일럿 개시
- **실제 유저**: `P001~P030` 로스터. **수요 증거**: 현재 학습 크롭 0장·라벨 0건 → ML 밴드 콜드. 스캔 정확도 주장 자체가 미검증(데이터 없이 모델 승격 불가).
- **CEO 결정(1줄)**: **모집 채널(내부/지인/모집공고)·예산·동의(PIPA) 서면 사인오프** 승인 — 사람·개인정보 관여라 에이전트 대행 불가.
- **해제 조건**: B1 통과(게이트 신뢰 확보) + 모집 소스 확정 + 동의 문안 최종본 승인 → `/pilot` 세션으로 라벨+동의 크롭 수집 개시(목표 크롭 100+ dry-run, 300+ 학습).

### B3 — BD 제휴 (올리브영/브랜드몰)
- **실제 유저**: 커머스 아웃링크 클릭 유저. **수요 증거**: `/api/out` 클릭 추적 인프라는 SHIPPED이나 **딜 0건** → 제휴 딥링크 없이는 수익화·전환 데이터 미확보.
- **CEO 결정(1줄)**: **아웃리치 1순위 파트너 + 커머셜 조건(수수료/딥링크 스펙)** 결정 — 외부 협상이라 에이전트 대행 불가.
- **해제 조건**: 제휴 계약 체결 → 오너가 `COMMERCE_LINK_OVERRIDES_JSON` env로 딥링크 교체(`docs/commerce-partnership-playbook.md`). *(env 반영은 프로덕션 config → 오너 전용.)*

## 다음 사이클 예고
- B1 해제 시 → `/eval`로 첫 골든셋 재판독 회귀 리포트 생성.
- B2 해제 시 → `/ops` ML 밴드 추적 + 크롭 카운트 KPI 계기판.
- 상시: smoke 그린 유지(A1), 문서 동기(A4).
