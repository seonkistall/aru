# 아루 ARU — 매일의 K뷰티 루틴

> **ARU = Areumdaum + Routine + U** · *ARU is your daily Korean beauty routine.*
> 아름다움을 매일의 루틴으로 만들어주는 K뷰티 앱.

> **버전 v0.4.0 (프로 스캔 경험)** · 최종 업데이트 2026-07-03 · 작업상황: [`docs/STATUS.md`](docs/STATUS.md)
> **정체성:** 셀피 → 피부 분석 → 화장품 추천 앱. 다른 소셜앱(밥로그/오뜨)과 혼동 금지.

셀피 한 장으로 **피부를 분석**하고, 그에 맞는 **화장품·루틴을 추천**하는 K뷰티 앱. 브랜드명 **아루(ARU)** — 구 명칭 결(gyeol)·kbeauty-app에서 2026-07-03 통합 리브랜딩. (내부 저장 키 `gyeol_*`·Supabase 버킷명은 데이터 호환을 위해 유지)

**라이브:** https://aru-beauty.vercel.app

## ⚠️ 코드 작성 규칙 (필독)
이 레포는 Next.js 기반이지만 **표준 Next.js가 아니다.** 루트 [`AGENTS.md`](AGENTS.md)에 따라 **코드를 쓰기 전 `node_modules/next/dist/docs/`의 해당 가이드를 먼저 확인**하고 deprecation 경고를 준수할 것.

## 전략 (office-hours 설계 APPROVED · 2026-06-28)
- **여성-우선 국내 MVP** 로 시작.
- **카메라(피부 스캔) = 렌탈 훅 + 숏폼 바이럴** 동력.
- **북극성:** 외국인 대상 **K뷰티 컨시어지**.
- 설계 문서: `~/.gstack/projects/aru/`

## 현재 버전 — v0.2.0 "카메라 파일럿 통합"
- **카메라 파일럿 ML 루프** — 스캔 품질 게이트 + 이중동의(AI 분석/학습 크롭) + 참가자 세션(P001–P030) + `/ops` 대시보드 + Supabase sync + 오프라인 ML 파이프라인(`ml/`, MobileNetV3 목표)
- **ML 스캔 신뢰도 루프** — confidence/retake 판단, 모델 승격 메커니즘(`public/models/visible-attributes/manifest.json` + 피처 플래그)
- **커머스 아웃링크** — 올리브영/네이버/쿠팡/글로벌 검색 연결, `/api/out` 클릭 추적(UTM), 제휴 딥링크 오버라이드(`COMMERCE_LINK_OVERRIDES_JSON`)
- **손그림(xiaohei) 아이덴티티** — 순백 배경 + 小黑 캐릭터 + 손글씨 톤 (파일럿 UI 전체에 적용)

## 버전 이력
- **v0.4.0** (2026-07-03)
  - **랜드마크 추적 가이드**: T존·양볼 샘플링 존이 실제 측정 랜드마크를 따라 얼굴에 잠금(✓) + 얼굴 윤곽 추적 도트 (미러링 보정)
  - **4단계 분석 연출**: 프레임 정합→신호 추출→판정→교차 검증, 단계당 최소 800ms 페이싱 + 결과 행 스태거 리빌
  - **아침/저녁 개인화 루틴**: 스캔·설문 신호별 단계 구성 + 단계별 "왜" 근거 + 주기 칩 (스캔 미적용 시 설문 근거만 사용)
  - **플로우 스테퍼**: 촬영→설문→추천→케어 진행 표시를 소비자 4개 페이지에 통일
  - `docs/analysis-performance-roadmap.md` — 분석 성능 개선 트랙별 태스크 로드맵
- **v0.3.1** (2026-07-03)
  - MediaPipe **VIDEO 러닝모드** 전환(detectForVideo, 비디오 엘리먼트 직접 읽기) + 촬영 순간 움직임 재계산(스테일 steady 제거)
  - **Pretendard 셀프호스팅**(npm 패키지 dynamic subset — 렌더 블로킹 서드파티 CDN 제거)
  - **프라이버시 페이지 KO/EN** 이중언어(외국인 북극성 대비, 외부 AI 제공사 고지 유지)
  - care/privacy 주요 CTA **손그림(sketch) 버튼 통일** + care 빈 상태 영어 지원
  - 모바일 QA 체크리스트에 v0.3 자동촬영·스킨 항목 추가
- **v0.3.0** (2026-07-02 ~ 07-03)
  - **자동 촬영**: 품질 게이트 연속 통과 시 3·2·1 카운트다운 후 자동 캡처(토글 가능, 실패 시 4초 쿨다운)
  - **버스트 분석**: 3프레임 중앙값 융합 + 프레임 간 합의도 → confidence/retake 판단 정교화, ML 캘리브레이션 메타 기록
  - 스캔 성능: 라이브 게이트 노출측정을 얼굴 박스로 정합(역광 거부루프 해소), 캔버스 재사용, 스트림 누수 가드, 백그라운드 탭 스킵
  - 전면 감사 라운드: xiaohei 팔레트 통일(빨강=문제 의미 복원, 그림자 제거, 구 팔레트 잔재 청소), AA 대비 토큰, 동의 문구에 외부 AI 제공사 명시(PIPA, CONSENT v2), 홈 프라이버시 문구 정직화, 커머스 카피 사용자화(ko/en)
- **v0.2.0** (2026-06-29 ~ 07-02)
  - 카메라 파일럿 ML 파이프라인 + 데이터 추적성 + 스캔 신뢰도 루프 (Codex 라운드)
  - 커머스 아웃링크 + 파트너 오버라이드 + BM 플레이북
  - main(xiaohei)과 통합 머지 + 손그림 아이덴티티 리스타일
- **v0.1.0** (2026-06-28 ~ 06-29)
  - 결 v0: on-device skin scan + recommendation engine + data flywheel
  - 종합 리포트 + 비전 피부분석 (Gemini/OpenAI 스위처블)
  - 손그림 리디자인 (순백 + 小黑 + 손글씨)

## 실행

```bash
npm install
npm run dev        # http://localhost:3000
npm run smoke      # lint + build + ML 스크립트 컴파일 + 라우트 검증 (커밋 전 게이트)
```

비전 피부분석에는 Gemini 또는 OpenAI API 키가 필요하다(스위처블, 없으면 온디바이스 폴백).

## 관련 문서
- [`docs/STATUS.md`](docs/STATUS.md) — 작업 상황 / 다음 할 일
- [`AGENTS.md`](AGENTS.md) — 코드 작성 규칙 · 아키텍처 · 함정
- [`docs/pilot-ml-loop.md`](docs/pilot-ml-loop.md) — 30명 파일럿 운영 런북
- [`docs/commerce-partnership-playbook.md`](docs/commerce-partnership-playbook.md) — 제휴/BM 플레이북
- [`docs/mobile-camera-qa.md`](docs/mobile-camera-qa.md) — 모바일 카메라 QA 체크리스트
- 설계 doc: `~/.gstack/projects/aru/`
