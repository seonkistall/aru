# 결 (gyeol) / K뷰티 AI 추천 — 작업 상황 (STATUS)

> 최종 업데이트: **2026-07-01** · 버전: **v0.1.0 (결 v0)** · 브랜치: `main`

## 제품 정체성 (혼동 방지)
**셀피 → 피부 분석 → 화장품 추천** 앱. 브랜드명 **결(gyeol)**.
→ 이것은 **K뷰티 피부분석/추천** 제품이다. 다른 소셜앱(밥로그/오뜨)과 혼동 금지.
→ ⚠️ 레포는 Next.js 기반이지만 `AGENTS.md`에 "표준 Next.js가 아님 — 코드 작성 전 `node_modules/next/dist/docs/` 확인" 규칙이 걸려 있음. **코드 수정 시 반드시 준수.**

## 전략 (office-hours 설계 APPROVED, 2026-06-28)
- **여성-우선 국내 MVP.**
- 카메라(피부 스캔) = **렌탈 훅 + 숏폼 바이럴** 동력.
- 북극성(North Star) = **외국인 대상 K뷰티 컨시어지**.
- 설계 doc: `~/.gstack/projects/kbeauty-ai-advisor/`

## 현재 버전 — v0.1.0 "결 v0"
- **온디바이스 피부 스캔** + 추천 엔진 + 데이터 플라이휠 (결 v0)
- **종합 리포트 + 비전 피부분석** (Gemini / OpenAI 스위처블)
- **손그림(xiaohei) 리디자인** — 순백 + 小黑 캐릭터 + 손글씨 톤

## 지금까지 한 일 (커밋 이력)
1. `결(gyeol) v0` — on-device skin scan + recommendation engine + data flywheel (2026-06-28)
2. 종합 리포트 + 비전 피부분석 (Gemini/OpenAI 스위처블) (2026-06-29)
3. 손그림 리디자인 — 순백 + 小黑 캐릭터 + 손글씨 (2026-06-29)

## 상태
- 스택: Next.js (수정된 배포판 — AGENTS.md 참조)
- 비전 분석: Gemini/OpenAI 스위처블 (API 키 필요)
- 브랜치: `main`

## 다음 (Next)
- 피부분석 정확도/캘리브레이션 (`ml/calibrate.py` 계열)
- 렌탈 훅 → 숏폼 공유 루프 설계 반영

## 관련 문서
`README.md`(제품 개요) · `AGENTS.md`(코드 작성 규칙) · 설계 doc `~/.gstack/projects/kbeauty-ai-advisor/`
