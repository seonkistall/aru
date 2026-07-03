# 아루 ARU — 작업 상황 (STATUS)

> 최종 업데이트: **2026-07-03** · 버전: **v0.4.3** · 브랜치: `main` · 도식: [`architecture.md`](architecture.md)

## 제품 정체성 (혼동 방지)
**셀피 → 피부 분석 → 화장품·루틴 추천** 앱. 브랜드명 **아루(ARU)** = Areumdaum + Routine + U (구 결(gyeol), 2026-07-03 리브랜딩. GitHub `seonkistall/aru`, 내부 키 `gyeol_*`는 유지).
→ 이것은 **K뷰티 피부분석/추천** 제품이다. 다른 소셜앱(밥로그/오뜨)과 혼동 금지.
→ ⚠️ 레포는 Next.js 기반이지만 `AGENTS.md`에 "표준 Next.js가 아님 — 코드 작성 전 `node_modules/next/dist/docs/` 확인" 규칙이 걸려 있음. **코드 수정 시 반드시 준수.**

## 전략 (office-hours 설계 APPROVED, 2026-06-28)
- **여성-우선 국내 MVP.**
- 카메라(피부 스캔) = **렌탈 훅 + 숏폼 바이럴** 동력.
- 북극성(North Star) = **외국인 대상 K뷰티 컨시어지**.
- 설계 doc: `~/.gstack/projects/aru/`

## 현재 버전 — v0.2.0 "카메라 파일럿 통합"
- **카메라 파일럿 ML 루프**: 스캔 품질 게이트, 이중동의(AI 분석/학습 크롭 분리), 참가자 세션(P001–P030), `/pilot`·`/ops` 연구 모드, Supabase sync, 오프라인 ML 파이프라인(`ml/`)
- **스캔 신뢰도 루프**: confidence/retake 판단 + 모델 승격 메커니즘(manifest + `NEXT_PUBLIC_VISIBLE_ATTR_MODEL` 플래그)
- **커머스 아웃링크**: 올영/네이버/쿠팡/글로벌, `/api/out` 클릭 추적, `COMMERCE_LINK_OVERRIDES_JSON` 제휴 딥링크 오버라이드
- **손그림(xiaohei) 아이덴티티**: 순백 + 小黑 + 손글씨 — 파일럿 UI 전체 적용(토큰 스왑 + 홈/리포트/케어 캐릭터)

## 지금까지 한 일 (커밋 이력)
1. `결(gyeol) v0` — on-device skin scan + recommendation engine + data flywheel (2026-06-28)
2. 종합 리포트 + 비전 피부분석 (Gemini/OpenAI 스위처블) (2026-06-29)
3. 손그림 리디자인 — 순백 + 小黑 캐릭터 + 손글씨 (2026-06-29, 구 main)
4. K-beauty 카메라 파일럿 ML 파이프라인 + 데이터 추적성 강화 (2026-06-29, Codex)
5. ML 스캔 신뢰도 루프 (2026-06-30, Codex)
6. 커머스 아웃링크 + 파트너 추적 (2026-07-02)
7. main(xiaohei) ↔ 카메라 파일럿 **통합 머지**(PR #1, 파일럿 UI 기준) + **xiaohei 리스타일 라운드** (2026-07-02)
8. **자동 촬영(3·2·1) + 3프레임 버스트 분석** + 전면 감사 라운드(팔레트 통일·AA 대비·동의문구 PIPA 보강·성능픽스) (2026-07-03, PR #2)
9. **백로그 라운드**: MediaPipe VIDEO 모드 + 촬영순간 움직임 재계산 + Pretendard 셀프호스팅 + 프라이버시 KO/EN + sketch CTA 통일 (2026-07-03, PR #3)
10. **프로 스캔 경험**: 랜드마크 추적 샘플링 존 + 4단계 분석 연출 + 아침/저녁 개인화 루틴 + 플로우 스테퍼 + 성능 로드맵 문서 (2026-07-03, PR #4)
11. **참고레포 통합 + 폴리시 라운드**: --arch 베이크오프·K-means 톤 기록·ROI 트리밍·트러블 관찰 / 코너브래킷 존·스캔바 왕복·리포트 항목 확충(톤 균일감·T존 반사광·측정환경)·랜딩 사용법 카드·논문 리서치 반영 (2026-07-03)

## 상태
- 스택: Next.js 16.2.9 (수정된 배포판 — AGENTS.md 참조) + MediaPipe + Supabase
- 비전 분석: Gemini/OpenAI 스위처블 (API 키 없으면 온디바이스 폴백)
- 배포: **Vercel 라이브** https://aru-beauty.vercel.app (프로젝트 `aru-beauty`)
- 검증 게이트: `npm run smoke` (lint + build + py_compile + 라우트 7종)
- 브랜치: `main` (작업장: `C:\dev\working\aru`)

## 다음 (Next)
- **모바일 실기기 QA** — iPhone Safari / Android Chrome. v0.3 자동촬영 타이밍·xiaohei 스킨 항목 포함 (`docs/mobile-camera-qa.md`)
- **30명 파일럿 데이터 수집** — `/pilot` 세션으로 라벨+동의 크롭 확보 (`docs/pilot-ml-loop.md`)
- **ML 게이트 준수**: 크롭 <30 캘리브레이션만 · 100+ dry-run · 300+ MobileNetV3 학습 → 이후 ONNX 런타임 연결 (현재 데이터 0)
- **BD 제휴** — 올리브영/브랜드몰 딜 후 `COMMERCE_LINK_OVERRIDES_JSON`으로 딥링크 교체 (`docs/commerce-partnership-playbook.md`)
- 렌탈 훅 → 숏폼 공유 루프 설계 반영

## 관련 문서
`README.md`(제품 개요) · `AGENTS.md`(코드 작성 규칙) · `docs/pilot-ml-loop.md` · `docs/commerce-partnership-playbook.md` · `docs/mobile-camera-qa.md` · 설계 doc `~/.gstack/projects/aru/`
