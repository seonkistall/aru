# ARU Product Requirements Document

상태: Production-readiness 기준 문서

제품 오너: ARU product owner

릴리스 오너: 배포를 실행하는 지정 담당자

최종 수정: 2026-07-16

이 문서는 ARU 제품 범위, 신뢰 경계, 데이터 처리, 성공 지표와 출시 조건의 단일 기준이다. 구현 상세는 [architecture.md](architecture.md), 실행 증거는 [STATUS.md](STATUS.md), 실제 출시 절차는 [production-release-checklist.md](production-release-checklist.md)를 따른다.

## 1. 문제와 제품 약속

K-뷰티 구매자는 제품 수와 과장된 효능 표현 때문에 자신의 선호, 예산과 사용 맥락에 맞는 선택지를 빠르게 좁히기 어렵다. ARU는 계정 없이 선택형 온디바이스 카메라 관찰과 짧은 설문을 결합해 최대 3개의 화장품 후보와 사용 루틴을 제안한다.

제품 약속은 다음과 같다.

- 카메라는 선택 사항이며 설문만으로도 추천을 완료할 수 있다.
- 기본 스캔은 기기 안에서 처리한다.
- 현재 사진에서 관찰 가능한 화장품 선택 보조 신호만 설명한다.
- 추천 이유, 예산대, 용량, 주요 성분과 피해야 할 성분 적합성을 함께 보여준다.
- 가격, 재고, 전성분과 판매 조건은 판매처에서 다시 확인하도록 명시한다.
- 진단, 치료, 예방, 완치 또는 효능 보장을 하지 않는다.

## 2. 사용자

### 주 사용자

- 계정 생성 없이 모바일에서 빠르게 K-뷰티 후보를 좁히려는 한국어 사용자
- 한국 여행·직구 상황에서 EN/JA/ZH로 한국 화장품 안내를 받으려는 사용자
- 카메라 사용을 원하지 않거나 카메라/모델을 사용할 수 없어 설문 경로가 필요한 사용자

### 제한 사용자

- 명시적으로 동의한 카메라 품질·추천 파일럿 참가자
- 동의·라벨·크롭 메타데이터를 확인하고 내보내거나 동기화하는 내부 연구 운영자

내부 `/ops`, `/eval`, `/pilot` 화면은 소비자 기능이 아니며 production에서는 기본 차단한다.

## 3. 핵심 여정

### A. 카메라 여정

`홈 → 스캔 권한/선택 동의 → 피부 ROI 품질 게이트 → 촬영/재촬영 → 설문 → 리포트 → 판매처·케어·공유 → 선택형 사용 시작/체크인`

성공 조건:

- 권한 거부, 모델 로딩 실패, 지원하지 않는 브라우저에서 설문 경로가 항상 제공된다.
- 전면 카메라는 사용자에게 미러링해 보이되 분석 좌표와 결과는 일관된다.
- T존과 양볼 피부 영역의 정렬·밝기·반사·선명도가 기준을 통과해야 촬영한다.
- 최종 촬영 프레임도 라이브 프리뷰와 같은 품질 기준을 통과해야 한다.
- 스캔이 추천에 적용되지 않은 경우 그 사실과 이유를 리포트에 표시한다.

### B. 설문 전용 여정

`홈 → 설문 → 리포트 → 판매처·케어·공유 → 선택형 사용 시작/체크인`

성공 조건:

- 카메라를 요구하거나 카메라 결과가 있는 것처럼 표현하지 않는다.
- 필수 항목, 진행 상태, 저장 실패와 다음 행동을 모바일 첫 화면에서 이해할 수 있다.
- 설문 재방문 시 같은 탭 세션의 기존 답변을 복원한다.

### C. 연구 여정

`내부 파일럿 세션 → participant/session 일치 확인 → 목적별 동의 → 촬영·피드백 → 로컬 검토/내보내기 → 인증된 서버 동기화 → 오프라인 평가`

성공 조건:

- AI 전송과 학습용 크롭 보존은 서로 다른 선택이다.
- 파일럿에서는 participant와 session이 정확히 일치한 동의만 허용한다.
- 일반 소비자 동의를 파일럿 동의로 대체하지 않는다.
- 서버 동기화는 토큰, 허용 Origin, 크기 제한과 비공개 service-role 경로를 모두 통과해야 한다.

## 4. 기능 요구사항

### 소비자 기능

- KO/EN/JA/ZH/AR 언어 전환(기본값 EN, AR은 RTL)과 언어별 읽기 쉬운 타이포그래피
- 계정 없는 로컬 우선 스캔·설문·추천·루틴
- 최대 3개 후보, 비교표, 판매처 검색 링크와 명시적인 “사용 시작” 기록
- 현재 가격·재고·성분 재확인 안내 및 광고/제휴 여부의 사실 기반 표시
- 전체 기기 데이터 삭제, 이메일 구독 해지, 카메라 없는 탈출 경로
- 44px 이상 터치 영역, 키보드 사용, 명확한 포커스/레이블, 모바일 오버플로 없음

### 플랫폼·운영 기능

- `/api/analyze`, `/api/reason`: byte 제한, JSON 스키마 검증, per-IP 제한, provider timeout, 안전한 오류 응답
- `/api/sync`: 서버 토큰, Origin 검증, 업로드 제한, private Supabase 저장
- `/api/reengage/*`: 명시적 구독, 서명·만료 해지 토큰, 철회 필터, 보존 만료 정리
- Supabase 앱 테이블 RLS 활성화 및 `anon`/`authenticated` 직접 권한 철회
- MediaPipe WASM과 모델을 ARU origin에서 제공
- funnel 이벤트는 자유 입력, 사진, 이메일 또는 기기 파생 식별자를 포함하지 않음

## 5. 비기능 요구사항

- 지원 기준: 최신 Android Chrome과 iOS Safari, 360px 이상 모바일 뷰포트
- 카메라: 중복 스트림·landmarker 누수 없음, background/resume·회전·재시도에서 복구 가능
- 성능: 카메라 품질 틱에서 대형 배열 할당을 피하고 느린 기기에서 UI 스레드를 점유하지 않음
- 신뢰성: 저장소 사용 불가, 네트워크 실패, AI 미설정 시 핵심 설문 추천 경로 유지
- 보안: 클라이언트 번들에 service-role, sync, cron, unsubscribe, Resend 비밀을 포함하지 않음
- 품질: lint, 전체 테스트, production build, ML compile, route/auth smoke가 모두 통과해야 함
- 관측성: 배포 상태, API 4xx/5xx, 크론 발송/정리 결과를 릴리스 오너가 확인 가능해야 함

## 6. 화장품·의료 경계와 신뢰 규칙

- “현재 사진에서 보이는 경향”과 사용자가 답한 선호만 말한다.
- 피부 질환명, 진단 확률, 치료·예방·완치 표현과 임상 효능 보장을 금지한다.
- 통증, 지속되는 염증, 갑작스러운 변화 등은 제품 추천 우선순위를 조작하지 않고 전문 상담 안내로 분리한다.
- 보이는 붉은기만으로 병원 연결을 우선하지 않는다. 사용자가 “트러블” 고민을 명시한 경우에만 상담 선택지를 강조할 수 있다.
- 판매처 클릭을 구매 또는 실제 사용으로 기록하지 않는다. 실제 사용은 사용자의 별도 확인 동작으로만 기록한다.
- 검증되지 않은 별점, 리뷰 수, 가격, 재고, 제휴·인증 배지를 생성하지 않는다.
- LLM 출력도 동일한 금지 클레임 필터를 통과하며 실패하면 안전한 로컬 문구로 대체한다.

## 7. 데이터·동의·보존 계약

| 데이터 | 위치 | 목적 | 보존/삭제 | 전송 조건 |
|---|---|---|---|---|
| 카메라 프레임·스캔 판독·설문 | 브라우저 메모리/sessionStorage | 현재 추천 | 탭 세션 종료 또는 “기기 데이터 삭제” | 기본 전송 없음 |
| 최근 결과·기록·사용 시작·체크인 | localStorage | 재방문·후속 케어 | 사용자가 전체 삭제할 때까지 | 기본 전송 없음 |
| 익명 funnel 이벤트 | localStorage, 선택형 비공개 sync | 제품 퍼널 집계 | 기기 최대 1,000건; 사용자 삭제 가능 | 인증된 `/api/sync`만 |
| 동의·라벨·파일럿 메타데이터 | localStorage, 선택형 비공개 sync | 감사·품질 평가 | 사용자 삭제 또는 운영 연구 보존 정책 | 정확한 범위 동의 + 인증된 sync |
| 학습용 피부 크롭 | localStorage/private Storage | 파일럿 캘리브레이션 | 기본 180일; 만료·철회 시 삭제/제외 처리 | `learning_crop` 동의 + 파일럿 scope 일치 |
| AI 분석용 피부 크롭 | 처리 중 메모리/AI provider | 선택형 교차 검증 | ARU가 영구 저장하지 않음 | `ai_analysis` 동의 후에만 |
| 리마인더 이메일·동의/발송 메타데이터 | 비공개 Supabase | 2·4주 리마인더 | 4주차 발송 또는 해지 후 30일에 삭제 대상 | 명시적 이메일 구독 |

모든 로컬 키는 [device-data.ts](../lib/device-data.ts)에 등록한다. 새 데이터는 목적, 저장 위치, 전송 조건, 삭제 경로와 보존 기간이 정해지기 전에는 수집하지 않는다.

## 8. 퍼널 지표 계약

모든 비율은 지정 보고 기간의 고유 `sessionId` 교집합을 사용한다. 같은 세션의 중복 이벤트는 한 번으로 센다. 카메라 여정과 설문 전용 여정을 억지로 한 직선 퍼널로 합치지 않는다.

| 지표 | 공식 | 이벤트/소스 | 초기 출시 목표 |
|---|---|---|---|
| 스캔 완료율 | 스캔 완료 세션 ÷ 스캔 시작 세션 | `scan_completed / scan_started` | ≥70% |
| 촬영 실패율 | 시작 후 3분 안에 완료하지 못한 세션 ÷ 스캔 시작 세션 | funnel reporting | ≤20% |
| 설문 완료율 | 조회 후 완료한 세션 ÷ 설문 조회 세션 | `survey_completed ∩ survey_viewed / survey_viewed` | ≥65% |
| 리포트 도달률 | 설문 완료 후 추천을 본 세션 ÷ 설문 완료 세션 | `reco_viewed ∩ survey_completed / survey_completed` | ≥95% |
| 재촬영 권고율 | `retake=true` 완료 세션 ÷ 스캔 완료 세션 | `scan_completed.props` | ≤25% |
| 추천 행동률 | 추천 조회 후 판매처를 연 세션 ÷ 추천 조회 세션 | `commerce_clicked ∩ reco_viewed / reco_viewed` | ≥15% |
| 공유율 | 스캔 완료 후 공유한 세션 ÷ 스캔 완료 세션 | `share_clicked ∩ scan_completed / scan_completed` | 관찰 |
| 2주 체크인율 | 2주 도래 후 체크인을 완료한 구독자 ÷ 2주 도래 구독자 | reminder/check-in | ≥20% |

`failurePreventionConversion`은 기존 코드의 스캔 완료→판매처 행동 진단 지표 이름이며, 구매·효과·실패 방지를 증명한다는 뜻으로 외부에 표시하지 않는다. AI 전송·학습 동의율은 안전 KPI이지 성장 최적화 대상이 아니다. 디바이스 분할은 안정적인 fingerprint를 만들지 않는 범위에서만 한다.

## 9. 출시 게이트

### Web production

- production Supabase schema 적용, RLS와 브라우저 역할 거부 재현
- 실제 Vercel secrets·허용 origin·방화벽/지출 제한 설정
- 실제 Resend 발송과 서명 해지, 철회 제외, 30일 정리 검증
- `npm run smoke`와 배포 후 canary 통과
- `/`, `/scan`, `/survey`, `/report`, `/privacy`, 주요 API 경계의 오류 로그 점검

### Android TWA

- 설치 가능한 manifest, 512px 아이콘·maskable 아이콘, HTTPS service worker/offline 정책
- Digital Asset Links가 production package name과 release signing certificate를 정확히 검증
- Android back, status/navigation bar, orientation, camera permission과 외부 판매처 전환 검증
- TWA에서 웹 origin 검증 실패 시 표시되는 브라우저 UI를 출시 차단 사유로 처리

### Google Play

- 실제 개발자/법인명, 지원 이메일, 개인정보처리방침 URL 확정
- Data safety, 카메라 권한 설명, 콘텐츠 등급, 앱 접근 안내를 실제 동작과 일치시킴
- AAB release signing, target API, Play pre-launch report와 내부 테스트 트랙 통과
- 최소 Galaxy S25 Edge Android Chrome/TWA와 iPhone Safari의 물리 단말 증거 완료
- 의료기기처럼 보이는 스토어 문구·스크린샷·효능 주장이 없음

## 10. 역할과 외부 선행조건

릴리스 오너는 schema/secret/firewall 적용, 실기기 QA, Resend 실발송, AAB 서명, Play Console 선언과 배포 후 canary를 수행하고 증거 링크를 남긴다. 코드 변경자 혼자 확인할 수 없는 외부 항목은 “완료”로 간주하지 않는다.

출시 전 오너가 제공하거나 확정해야 하는 항목:

- Play Console 계정의 실제 개발자/법인명과 지원 이메일
- Android application ID와 release signing certificate
- Resend에서 검증된 소유 도메인, 발신 주소와 실제 수신 테스트 주소
- production Supabase/Vercel/AI provider secrets와 비용 한도
- 파일럿 연구 보존·삭제 책임자와 문의 채널

## 11. 범위 제외

- 의료 진단·치료·질환 모니터링
- 계정과 기기간 개인 이력 동기화
- 결제·주문 완료 또는 판매처 재고 보장
- 데이터 준비 게이트를 통과하기 전 학습 모델 자동 승격
- 동의하지 않은 사진 저장·전송
- iOS App Store 네이티브 패키징
