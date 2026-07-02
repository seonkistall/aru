# 결 (gyeol) — K뷰티 AI 피부분석 & 화장품 추천

> **버전 v0.1.0 (결 v0)** · 최종 업데이트 2026-07-01 · 작업상황: [`docs/STATUS.md`](docs/STATUS.md)
> **정체성:** 셀피 → 피부 분석 → 화장품 추천 앱. 다른 소셜앱(밥로그/오뜨)과 혼동 금지.

셀피 한 장으로 **피부를 분석**하고, 그에 맞는 **화장품을 추천**하는 K뷰티 앱. 브랜드명 **결(gyeol)**.

## ⚠️ 코드 작성 규칙 (필독)
이 레포는 Next.js 기반이지만 **표준 Next.js가 아니다.** 루트 [`AGENTS.md`](AGENTS.md)에 따라 **코드를 쓰기 전 `node_modules/next/dist/docs/`의 해당 가이드를 먼저 확인**하고 deprecation 경고를 준수할 것.

## 전략 (office-hours 설계 APPROVED · 2026-06-28)
- **여성-우선 국내 MVP** 로 시작.
- **카메라(피부 스캔) = 렌탈 훅 + 숏폼 바이럴** 동력.
- **북극성:** 외국인 대상 **K뷰티 컨시어지**.
- 설계 문서: `~/.gstack/projects/kbeauty-ai-advisor/`

## 현재 버전 — v0.1.0 "결 v0"
- **온디바이스 피부 스캔** + 추천 엔진 + 데이터 플라이휠
- **종합 리포트 + 비전 피부분석** (Gemini / OpenAI 스위처블)
- **손그림(xiaohei) 리디자인** — 순백 배경 + 小黑 캐릭터 + 손글씨 톤

## 버전 이력
- **v0.1.0** (2026-06-28 ~ 06-29)
  - 결 v0: on-device skin scan + recommendation engine + data flywheel
  - 종합 리포트 + 비전 피부분석 (Gemini/OpenAI 스위처블)
  - 손그림 리디자인 (순백 + 小黑 + 손글씨)

## 실행

```bash
npm install
npm run dev        # http://localhost:3000
```

비전 피부분석에는 Gemini 또는 OpenAI API 키가 필요하다(스위처블).

## 관련 문서
- [`docs/STATUS.md`](docs/STATUS.md) — 작업 상황 / 다음 할 일
- [`AGENTS.md`](AGENTS.md) — 코드 작성 규칙
- 설계 doc: `~/.gstack/projects/kbeauty-ai-advisor/`
