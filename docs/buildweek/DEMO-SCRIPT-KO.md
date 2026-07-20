# ARU 데모 영상 — 한국어 나레이션 대본 (촬영용)

목표 길이 **2분 52초** (제한 3분). 낭독 속도 기준 **분당 약 260자**(편안한 설명 톤).
아래 "나레이션"은 요약이 아니라 **그대로 읽는 문장**입니다. 괄호 안은 읽지 않습니다.

전체 낭독 분량 약 670자. 구간 사이 0.5~1초씩 쉬면 총 2분 50초 안팎이 됩니다.

---

## S1 · 0:00–0:17 · 문제 제기

**화면**: 올리브영 매대 또는 제품 리뷰를 빠르게 스크롤하는 화면. (실사 B-roll 없으면 앱 밖 웹 화면으로 대체)

**나레이션** (72자 / 약 17초)

> 올리브영 매대 앞에서 한참 고민하다 그냥 나온 적, 있으시죠.
> 제품은 수천 개인데, 지금 내 피부에 뭐가 맞는지 삼십 초 안에 알려주는 서비스는 없었습니다.

**영어 자막**: Ever left a beauty store after ten minutes, still empty-handed? Thousands of products — and nothing tells you what fits *your* skin in 30 seconds.

---

## S2 · 0:17–0:31 · 제품 소개 + 사용자 통찰

**화면**: 아루 홈(영어 UI 기본). 우측 상단 국기 pill이 보이게.

**나레이션** (62자 / 약 14초)

> 아루는 셀피 한 장으로 그걸 대신합니다.
> 기본 언어가 영어인 이유는, 저희 핵심 사용자가 한국을 찾은 외국인이기 때문입니다.

**영어 자막**: ARU replaces that with one selfie. English is the default because our core users are visitors to Korea.

---

## S3 · 0:31–1:11 · 스캔 실동작 (핵심 데모)

**화면**: **실기기 실촬영 필수.** 얼굴 정렬 → 품질 칩이 하나씩 초록으로 바뀜 → 3·2·1 카운트다운 → 자동 촬영 → 분석 연출까지 끊김 없이.

**나레이션** (110자 / 약 25초 — 남는 15초는 화면만 보여주며 침묵)

> 얼굴을 가이드에 맞추면 조명, 거리, 흔들림, 반사를 실시간으로 확인합니다.
> 네 조건이 동시에 맞는 순간에만 카운트다운이 돌고, 자동으로 찍힙니다.
> 기본 스캔은 전부 기기 안에서 끝납니다. 원본 사진은 서버로 보내지도, 저장하지도 않습니다.

**영어 자막**: Light, distance, steadiness, glare — checked live. It captures only when all four line up. The basic scan runs entirely on your device; the original photo is never sent or stored.

---

## S4 · 1:11–1:46 · 리포트 + 클레임 필터 (GPT-5.6 사용 설명)

**화면**: 리포트 3단계 탭 이동 — 분석 → 추천 3개 → 아침/저녁 루틴. 추천 카드의 "왜 이 제품" 문구를 잠깐 확대.

**나레이션** (118자 / 약 27초)

> 읽는 건 딱 세 가지, 유분과 붉은기와 결입니다.
> 추천 문구는 지피티 오 점 육이 자연스럽게 다듬습니다. 다만 다섯 개 언어별 금지어 필터를 통과하지 못하면 승인된 템플릿으로 자동 교체됩니다.
> 그래서 이 앱은 개선이나 미백 같은 말을 구조적으로 할 수 없습니다.

**영어 자막**: We read only three signals: oil, redness, texture. GPT-5.6 phrases the reasons — but anything failing our per-language banned-claims filter is swapped for an approved template. This app structurally cannot say "improves" or "whitens."

> 발음 메모: "GPT-5.6"은 **"지피티 오 점 육"**으로 읽습니다. (영어권 자막 대비 "GPT five point six"도 무방)

---

## S5 · 1:46–2:03 · 루프 완결

**화면**: 케어 화면 판매처 카드 → 체크인 화면(2주차 배지).

**나레이션** (65자 / 약 15초)

> 제품 후보 세 개와 아침 저녁 루틴, 판매처 연결까지 이어지고,
> 이 주와 사 주 뒤 이메일로 사용감을 회수해 다음 추천에 반영합니다.

**영어 자막**: Three product options, an AM/PM routine, and retailer links — then a 2- and 4-week email check-in that feeds the next recommendation.

---

## S6 · 2:03–2:19 · 다국어와 RTL

**화면**: 국기 스위처 열기 → 한국어 → 일본어 → **아랍어**(레이아웃이 좌우로 뒤집히는 순간을 반드시 포함).

**나레이션** (40자 / 약 9초)

> 언어는 다섯 개.
> 아랍어에서는 레이아웃도, 진행 화살표 방향도 함께 뒤집힙니다.

**영어 자막**: Five languages. In Arabic the layout — and the direction of every progress arrow — flips with it.

---

## S7 · 2:19–2:45 · Codex 활용과 실패 복구 (심사 핵심)

**화면**: 터미널에서 `npm run smoke` 통과 로그 → GitHub `codex/*` 브랜치 목록 → `lib/scan-geometry.ts` 테스트 파일 순으로 전환.

**나레이션** (160자 / 약 37초 — 이 구간은 화면 전환을 나레이션에 맞춥니다)

> 여기까지를 코덱스와 함께 브랜치 단위로 만들었습니다.
> 안드로이드에서 자동촬영이 두 번 실패했을 때, 임계값을 더 추측하는 대신 실기기 디버그 데이터를 받아봤습니다.
> GPU가 손상된 좌표를 뱉고 있었습니다. 임계값 문제가 아니라 입력 데이터가 오염된 거였습니다.
> 코덱스에게 CPU 폴백 자가복구를 구현시키고, 그 좌표 수학을 단위 테스트로 못박았습니다.
> 지금은 삼백삼십오 개 테스트가 이걸 지킵니다.

**영어 자막**: We built this with Codex, branch by branch. When Android auto-capture failed twice, we stopped guessing thresholds and pulled real-device debug data — the GPU was emitting corrupted coordinates. Not a threshold bug; poisoned input. Codex implemented the CPU-fallback self-healing, and we pinned that coordinate math in unit tests. 335 tests guard it now.

---

## S8 · 2:45–2:52 · 임팩트와 마무리

**화면**: 인터뷰 결과 한 줄 슬라이드 → 아루 로고/URL.

**나레이션** (45자 / 약 11초)

> 인터뷰한 열 명 중 네다섯 명이, 스캔 뒤 추천 제품을 사겠다고 했습니다.
> 아루입니다.

**영어 자막**: Four to five of ten interviewed users said they would buy the recommended product after scanning. This is ARU.

---

# 촬영·녹음 가이드

## 순서
1. **화면 녹화 먼저** — 실기기(안드로이드 또는 아이폰) 화면 녹화로 S2~S6를 한 번에 이어서 찍습니다. 스캔은 반드시 실제 얼굴로, 자동촬영 카운트다운이 진짜 도는 장면이어야 합니다(에뮬레이터·가짜 영상 금지 — 심사의 "실행 가능한 핵심 데모" 근거).
2. **터미널 녹화** — S7용으로 `npm run smoke` 전체 통과 로그와 GitHub 브랜치 목록.
3. **나레이션 녹음** — 위 대본을 구간별로 따로 녹음(한 번에 안 읽어도 됨). 실수하면 그 문장만 다시.
4. **편집** — 나레이션에 화면을 맞춥니다. 반대로 하면 길이가 안 맞습니다.

## 낭독 팁
- 쉼표에서 살짝 끊고, 마침표에서 0.3초 쉽니다. 빨리 읽으면 S3·S7이 화면보다 먼저 끝납니다.
- 숫자는 한글 읽기 그대로: "삼십 초", "이 주와 사 주", "삼백삼십오 개".
- S3와 S7이 가장 중요합니다. 이 두 구간만 톤을 또렷하게 하고 나머지는 편하게.

## 자막
영어 자막을 **반드시** 넣습니다. 심사자가 한국어 화자가 아닐 수 있고, 자막이 있으면 나레이션 발음 리스크가 사라집니다. 위 각 구간의 "영어 자막"을 그대로 쓰면 됩니다.

## 3분을 넘길 때 자르는 순서
1. S6 다국어 구간을 9초 → 5초로 (아랍어 전환 순간만 남김)
2. S1 문제 제기를 17초 → 10초로 (두 번째 문장만)
3. S5를 15초 → 10초로 (체크인 화면만)

**절대 자르지 않는 것**: S3 스캔 실동작, S7 Codex·실패복구. 이 둘이 Technological Implementation 점수의 근거입니다.

## 정확성 주의 (이 제품의 포지셔닝이 "정직함"이라 더 중요)
- S3의 "보내지도 저장하지도 않습니다"는 **기본 스캔 경로** 기준입니다. AI 분석에 별도 동의하면 얼굴 크롭이 전송됩니다. 대본은 "기본 스캔은"으로 시작하니 그대로 읽으면 정확합니다. 이 앞 단어를 빼고 읽지 마세요.
- S8은 **구매 의향**이지 실제 구매가 아닙니다. "사겠다고 했습니다"까지가 정확한 표현입니다. "샀습니다"로 바꾸지 마세요.
- 테스트 335개 = Vitest 293 + Playwright 모바일 42. 촬영 시점에 수가 달라졌으면 숫자를 맞춰 읽습니다.

## 업로드
- YouTube **공개**(비공개·미등록 아님). 제목 예: `ARU — 30-second on-device K-beauty skin scan | OpenAI Build Week`
- 설명란에 레포 URL(https://github.com/seonkistall/aru-buildweek)과 라이브 URL(https://aru-beauty.vercel.app)을 넣습니다.
