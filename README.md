# 아루 ARU — 매일의 K뷰티 루틴

> **ARU = Areumdaum + Routine + U** · *ARU is your daily Korean beauty routine.*
> 아름다움을 매일의 루틴으로 만들어주는 K뷰티 앱.

> **버전 v0.6.8** · 최종 업데이트 2026-07-07 · 작업상황: [`docs/STATUS.md`](docs/STATUS.md) · **작동 원리 도식: [`docs/architecture.md`](docs/architecture.md)**
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

## 현재 버전 — v0.6.8
- **적응형 측정영역 가이드**: 이마/T존·왼볼·오른볼 가이드가 고정 박스처럼 보이지 않도록 얼굴 크기와 각 ROI 폭에 비례해 자동 리사이즈.
- **좌우 볼 추적 정밀화**: 양볼 전체 평균으로 반을 나누지 않고 MediaPipe 좌우 볼 랜드마크 묶음을 직접 사용해, 얼굴 폭·비대칭·프레이밍 변화에 더 강하게 추적.
- **스캔 신뢰 표시**: 카메라 품질 체크에 `측정영역` 상태를 추가하고, `?debug=1`에서 T존/양볼 영역 크기를 확인 가능.

## 버전 이력
- **v0.6.8** (2026-07-07) — Adaptive skin ROI guide polish
  - **얼굴 크기 적응**: ROI 가이드 패딩을 고정 퍼센트에서 얼굴 박스/영역 크기 비례 값으로 변경.
  - **양볼 추적**: 왼볼·오른볼을 명시적 랜드마크 그룹으로 계산해 평균 X 분할의 흔들림 제거.
  - **검증**: 가이드 영역 스케일링 회귀 테스트 추가.
- **v0.6.7** (2026-07-07) — Strict scan gate: guide center + stillness required
  - **촬영 조건 정합**: `face + centered + distance + brightness + noGlare + steady`가 모두 통과해야 수동 촬영 버튼과 자동 촬영 countdown이 동작.
  - **캡처 검증 강화**: balanced/tone 모드도 움직임을 필수 차단 조건으로 적용.
  - **Burst 안정성**: 분석 중 추가 프레임 사이 얼굴 중심 이동이 기준을 넘으면 결과를 만들지 않고 재촬영으로 되돌림.
- **v0.6.6** (2026-07-07) — Camera quality upgrade + crop/model path hardening
  - **카메라**: `getUserMedia`를 high-res first / legacy fallback 구조로 바꾸고, 실제 브라우저 협상 결과를 debug overlay에 기록.
  - **분석 crop**: AI 전송용 crop과 학습 저장용 crop을 분리해 각각 더 선명한 품질/크기 정책을 적용. 모델 입력은 기존 224×224 hook을 유지.
  - **저장/동기화**: upgraded crop으로 인한 localStorage quota와 Supabase 5MB sync cap 리스크를 UI 흐름에서 사전 처리.
  - **ML 단계**: manifest fallback drift를 수정하고, 외부 데이터는 product 성능 주장 근거가 아니라 pretraining/robustness/fairness audit 용도로 제한.
- **v0.6.5** (2026-07-07) — Moongi cosmetic 캐릭터 전면 적용 + 앱 아이콘 교체
  - **캐릭터 스타일**: `app/components/sketch.tsx`의 재사용 SVG 캐릭터 API(`Xiaohei`)는 유지하면서, 검정 실루엣·흰 눈·부드러운 미소·볼터치·화장품 소품 중심의 Moongi cosmetic helper로 재정의.
  - **아이콘**: 웹 앱 아이콘, iOS 홈화면 아이콘, favicon을 같은 캐릭터 마크로 동기화해 브랜드 첫인상을 통일.
  - **범위 제한**: 레이아웃, 추천 알고리즘, ML/카메라 로직, 커머스 플로우는 변경하지 않음.
  - **검증**: `npm run smoke` 통과. 최초 sandbox smoke는 Google Fonts fetch 제한으로 build 단계에서 실패했으나, 네트워크 허용 재실행에서 전체 통과.
- **v0.6.4** (2026-07-07) — Camera ML 데이터 루프 강화 + ARU 데이터 전략 + Vercel 배포 복구
  - **Camera/ML**: 동의 이벤트가 실제 저장된 경우에만 AI 분석 전송·학습 crop 보관을 허용하고, `learning_crop` opt-in feedback 루프를 일반 파일럿 사용자까지 확장. ML 예측이 비어 있거나 malformed이면 `ml-model`로 표시하지 않고 ROI fallback 유지.
  - **데이터 품질**: low-confidence/retake/ungradable 샘플을 calibration·manifest decoding·training에서 기본 제외. toneLstar/toneIta 등 subgroup 감사용 지표를 manifest에 포함.
  - **리포트/UX**: report trust copy와 스캔 반영 상태를 분리해 추천 신뢰도를 명확히 표시. 설문 저장 실패 시 빈 리포트로 이동하지 않도록 차단.
  - **데이터 전략**: 유분/모공/붉은기 이후 타깃(톤 균일도, 색소, 주름, 트러블, 건조/장벽, 흉터성 texture, 메이크업/필터 occlusion)과 공개·계약 데이터 소스 정책 문서화.
  - **배포**: Vercel project framework를 `Next.js`로 수정하고 output directory를 `Next.js default`로 복구. SSO protection 해제 후 `/`와 `/scan` 모두 `200 OK` 확인.
- **v0.6.3** (2026-07-04) — 소비자 5페이지 버그 수정 + 최적화 (5에이전트 검증)
  - **버그(촬영 우선)**: 자동복구 재로딩 중 촬영 버튼이 활성인 채라 중복 랜드마커 누수 가능 → `guideState !== "ready"`로 차단; **케어 커머스 클릭이 팝업차단으로 실패**(await 후 window.open) → 클릭 제스처 안에서 동기 오픈(major); 리포트·케어의 `gyeol_survey` JSON.parse 무가드 → 손상 시 빈 화면 → try/catch로 안전 폴백(major)
  - **최적화**: 촬영 profile의 죽은 필드 4개 제거(centerTolerance/minFaceSize/maxFaceSize), 랜딩 헤딩 a11y(h2/h3)+Arrow 죽은 prop, 설문 BUDGET_LABELS 호이스팅, reengage 이메일 aria-label, care.ts needsClinic 중복 제거
- **v0.6.2** (2026-07-04) — 안드로이드 GPU 손상 랜드마크 자동복구 (진짜 원인)
  - **삼성 안드로이드 실기기 debug(`?debug=1`) 데이터로 확인**: MediaPipe **GPU 델리게이트가 정규화 안 된 손상 랜드마크(값 ~1e34)**를 뱉어 rawSize가 1e35가 됨 → 거리 영원히 false, 존 추적 불가. 임계값·게이트 문제가 아니라 **입력 데이터 오염**이 진짜 원인
  - **자동 복구(self-heal)**: 얼굴 박스가 [0,1] 범위를 벗어나면 GPU 출력 손상으로 판단 → **CPU 델리게이트로 1회 자동 전환·재로딩**(느리지만 정확). 이걸로 **거리 판정 + T존/양볼 존 자동 추적이 동시에 정상화**(둘 다 유효 랜드마크 의존)
  - debug 오버레이에 현재 델리게이트(GPU/CPU) 표시
- **v0.6.1** (2026-07-04) — 안드로이드 자동촬영 게이트 재설계 (근본)
  - **중앙·거리를 "차단 조건"에서 제거** → 안내용으로만. 자동촬영 = 얼굴 + (너무 작지 않은) 거리 + 밝기 + 반사 없음. 거리는 종횡비 변환에 의존하지 않는 **원시 얼굴박스 크기**(0.2~0.98)로 판정 — 세로/가로 어떤 폰 스트림에서도 정상 셀피가 통과(적대적 검증 SOUND). 지난 두 번의 임계값 튜닝이 안 통했던 근본 원인(취약한 좌표변환을 게이트가 의존)을 제거
  - 촬영 검증부도 동일 규칙으로 정합(라이브 통과=촬영 통과), QualityPanel은 실제 요구조건(얼굴·거리·밝기·반사)만 표시
  - **`?debug=1` 진단 오버레이**: `/scan?debug=1`에서 실기기의 videoWxH·비율·fx/fy·원시크기·중앙·노출·각 게이트 값을 라이브로 표시(일반 URL엔 미노출)
- **v0.6.0** (2026-07-04) — 재유입 루프 + 스캔 파일 분할
  - **재유입(리마인더) 파이프라인**: 리포트에서 이메일 옵트인(`/api/reengage/subscribe`) → 2·4주 뒤 체크인 리마인더 스케줄 발송(`/api/reengage/run` + Vercel Cron). `reengage_contacts` 테이블, `lib/reengage` 발송 헬퍼. **RESEND_API_KEY+CRON_SECRET 미설정 시 안전 무동작** — 설정 순서는 [`docs/reengage-setup.md`](docs/reengage-setup.md). "매일의 루틴" 재방문 훅(MAU 레버)
  - **스캔 파일 분할**: `page.tsx`(1,700줄)에서 순수 스타일 → `app/scan/scan-styles.ts`, 바텀시트 → `app/scan/info-sheet.tsx`로 분리(동작 무변화, trivially-safe만)
- **v0.5.3** (2026-07-04) — 스캔 성능·구조 최적화
  - **적응형 탐지 스케줄링**: 고정 650ms setInterval → 자기예약 setTimeout(직전 틱 1.5배, 650~1500ms). 느린 폰 CPU에서 메인스레드 여유 확보(프리뷰·카운트다운 렌더), 데스크톱은 650ms 그대로
  - **좌표 변환 헬퍼 통합**: object-fit cover 가시영역 fx/fy 계산이 3곳에 중복돼 있던 것을 `coverCropFractions`로 단일화(중앙·거리 버그의 재발 위험 제거)
  - **핫패스 무할당화**: `faceBox` reduce→루프(포인트당 객체 생성 제거), 품질 점수 계산 배열/filter→인라인 카운트(틱마다 실행되는 경로)
- **v0.5.2** (2026-07-04) — 모바일 자동촬영 버그 수정 (핵심)
  - **중앙·거리 게이트가 폰에서 통과 안 되던 근본 원인 해결**: 게이트 임계값이 데스크톱 가로 웹캠 기준으로 튜닝돼 있어, 세로(9:16) 폰 스트림에서 정상 셀피가 `minFaceSize` 미달로 판정됐음. 임계값을 종횡비에 강건하고 관대하게 재보정(정상 프레이밍이 세로·가로 모두 통과, 명백히 어긋난 경우만 거부) — 4개 검증 렌즈 + 적대적 검증으로 진단
  - **`play()` 거부를 "권한 거부"로 오처리하던 blocker 수정**: iOS 저전력모드 등에서 카메라는 켜졌는데 거부 화면으로 빠지던 문제 — play() 실패는 무시하고 `onLoadedMetadata`로 재생 재시도
  - **가이드(MediaPipe) 로딩/실패 상태 추가**: 로딩 중 오버레이 + 실패 시 "다시 시도"·"사진 없이 추천받기" 탈출구 — 모델 로드 실패 시 무한 대기 제거
  - **모바일 뷰포트**: `100dvh` + `viewport-fit=cover`(동적 툴바/노치 대응, 데스크톱 무영향)
- **v0.5.1** (2026-07-03) — 캐릭터 앙증 + 플로우 폴리시
  - **小黑 앙증 업데이트**: 눈 확대(둥글둥글) + 은은한 볼터치 + 작은 미소 + 다리를 짧고 아담하게 — 홈·사용법 카드·리포트·케어 전 사용처 일괄 적용
  - **앱 아이콘 동기화**: 파비콘 SVG·iOS 아이콘(apple-icon.png)도 새 얼굴로 재생성
  - 폴리시: 바텀시트 열림 시 배경 스크롤 잠금, 자동촬영 카운트다운에 스크린리더 안내(aria-live)
- **v0.5.0** (2026-07-03) — 실기기 QA 피드백 라운드
  - **모바일 트래킹 픽스(핵심)**: 품질 게이트(중앙·거리)를 비디오 원좌표가 아니라 **화면에 보이는 3:4 크롭 좌표계**에서 평가 — 모바일 스트림(9:16/16:9)에서 "중앙"이 사실상 도달 불가였던 원인 해소. 촬영 검증도 동일 좌표계로 정합
  - **MediaPipe GPU→CPU 폴백**: 일부 기기의 GPU 델리게이트 초기화 실패 시 자동 CPU 전환
  - **원스크린 촬영 UX**: 촬영 팁·동의 상세를 **바텀시트 팝업**으로 이동, AI 전송·자동촬영을 한 줄 컴팩트 토글로, 품질 칩 축소(1행), 촬영 버튼 sticky — 정렬 중 화면이 흘러내리지 않음
- **v0.4.3** (2026-07-03)
  - **`/eval` 골든셋 회귀 하네스**: 고정 이미지 세트를 브라우저 안에서 현재 파이프라인으로 재판독(업로드 없음), 베이스라인 JSONL과 레벨 diff·변화 건수 표시, 이번 실행을 다음 베이스라인으로 내보내기 — 특징/임계값 변경의 개선/퇴행을 수치로 판정
  - **공유 카드 실전화**: `/studio`가 프리셋 대신 오늘 스캔 결과를 자동 프리필, **Web Share API**(OS 공유시트 → 카톡 원탭) + PNG 저장 폴백, 파일명 `aru-skin-card.png`, alert() → 인라인 오류
  - **iOS 홈화면 아이콘**(`apple-icon.png` 180px 小黑 얼굴), 스캔 상단 라벨 K-Beauty → ARU 스윕, 스모크에 `/eval` 라우트 추가
- **v0.4.2** (2026-07-03)
  - **모바일 아이덴티티**: viewport(테마 화이트) + 웹 매니페스트(standalone "아루") + 小黑 SVG 파비콘 — 홈화면 설치 지원
  - **바이럴 훅 연결**: 고아 페이지였던 `/studio`를 스캔 결과·리포트에서 진입 가능하게, 공유 카드의 옛 브랜드(K-Beauty) 제거
  - **데이터 플로우 픽스**: 스캔 결과를 분석 완료 즉시 세션에 저장(CTA 클릭 시에만 저장하던 유실 경로 제거)
  - 라이브 콘솔 전수 점검: 소비자 페이지 에러 0건 (히드레이션 픽스 프로덕션 검증)
- **v0.4.1** (2026-07-03)
  - **스캔 연출 폴리시**: 추적 존을 카메라 포커스식 코너 브래킷으로(잠금 시에만 필), 윤곽 도트 축소, 분석 카드 딤+진행 헤어라인
  - **스캔바 왕복**: 위→아래→위 1.1초 사이클 × 단계 페이싱 825ms×4 = 정확히 3회 완주 후 결과
  - **리포트 판독 확충**: 톤 균일감·T존 반사광(관찰형) + 측정 환경(조명/반사/영역) 섹션 — 스캔 카드·리포트 동시
  - **랜딩 고도화**: 손그림 사용법 카드 3장(小黑 포즈) + 스테퍼에 아루 워드마크 홈링크
  - React #418 히드레이션 버그 5곳 수정(report/care/privacy/pilot/scan), 체크인 회차 잠금 버그 수정, 논문·데이터셋 리서치(SCIN 라이선스 확정 등) 로드맵 반영
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
- [`docs/architecture.md`](docs/architecture.md) — **작동 원리 도식** (전체 구성·카메라 파이프라인·분석 엔진·데이터/동의·추천/커머스, Mermaid)
- [`docs/STATUS.md`](docs/STATUS.md) — 작업 상황 / 다음 할 일
- [`AGENTS.md`](AGENTS.md) — 코드 작성 규칙 · 아키텍처 · 함정
- [`docs/analysis-performance-roadmap.md`](docs/analysis-performance-roadmap.md) — 분석 성능 로드맵 · [`docs/golden-set.md`](docs/golden-set.md) — 회귀 프로토콜
- [`docs/pilot-ml-loop.md`](docs/pilot-ml-loop.md) — 30명 파일럿 운영 런북
- [`docs/commerce-partnership-playbook.md`](docs/commerce-partnership-playbook.md) — 제휴/BM 플레이북
- [`docs/mobile-camera-qa.md`](docs/mobile-camera-qa.md) — 모바일 카메라 QA 체크리스트
- 설계 doc: `~/.gstack/projects/aru/`
