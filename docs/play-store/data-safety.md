# Google Play Data safety worksheet

검토 기준일: 2026-07-16

부분 개정: 2026-10-16 (설문 기반 추천 이유 요청 항목 추가, AI 분석 토글 이름 수정)

대상 패키지: `com.seonkistall.aru`

대상 릴리스: `1.1.0 (11000)`

이 문서는 Play Console 입력용 작업표다. Google Play에서 “수집”은 앱에서 사용자 기기 밖으로 전송하는 행위를 포함하므로, 영구 저장하지 않는 선택형 AI 크롭도 보수적으로 포함한다. 제출 직전에 production 설정과 실제 provider 계약을 다시 확인한다.

## Data collection and security

| Play 질문 | 제안 답변 | 코드/운영 근거 |
|---|---|---|
| 앱이 사용자 데이터를 수집하거나 공유하는가 | 예 | 선택형 AI 크롭, 선택형 리마인더 이메일, `/report`가 동의 단계 없이 보내는 설문 기반 추천 이유 요청 |
| 전송 중 암호화되는가 | 예 | production HTTPS와 provider HTTPS API |
| 사용자가 데이터 삭제를 요청할 수 있는가 | 예 | `/privacy` 기기 데이터 삭제, 메일 원클릭 해지 후 30일 삭제 대상 |
| 계정 생성을 지원하는가 | 아니오 | ARU 소비자 플로우는 무계정 |
| 독립 보안 검토 | 아니오 | 외부 검증을 완료하기 전에는 선택하지 않음 |

## Declared data types

### Photos and videos → Photos

- 수집: 예, 선택 사항
- 공유: 아니오로 제안. Gemini/OpenAI가 ARU 지시에 따라 처리하는 service provider라는 계약 조건을 릴리스 오너가 확인해야 한다.
- 목적: App functionality
- 처리: 사용자가 촬영 옵션의 “더 자세한 AI 분석”(영어 화면 “More detailed AI analysis”)을 켜서 동의한 경우 얼굴 주변 크롭을 분석 요청 동안만 전송한다. ARU는 이 경로에서 이미지를 영구 저장하지 않는다.
- Ephemeral processing: 예로 제안. 공급자 설정·계약에서 API 입력의 모델 학습 미사용과 요청 이후 보존 조건을 확인한 뒤 확정한다.
- 기본 온디바이스 프레임·랜드마크는 기기 밖으로 전송하지 않으므로 이 선언의 대상이 아니다. 설문에서 나온 필드는 기기 밖으로 전송되므로 아래 항목에 따로 적는다.

### 설문 기반 추천 이유 요청 → 데이터 유형은 오너 확인 필요

- 제안 데이터 유형(미확정): App activity → Other user-generated content. 피부 고민을 건강 정보로 본다면 Health and fitness → Health info가 맞을 수 있으므로 릴리스 오너가 정한다.
- 전송 필드: 추천 결과가 있는 상태로 `/report`를 열 때마다 화면이 `POST /api/reason` 한 번에 추천 제품별로 제품 브랜드·이름·카테고리, 피부 타입(`type`), 그 제품과 겹치는 설문 고민(`matched`), 예산 구간 문구(`budgetText`), 그 제품이 제외 조건을 모두 충족할 때의 제외 성분 목록(`freeOf`), 화면에 이미 보이는 템플릿 추천 이유(`fallback`)와 언어 코드(`lang`)를 보낸다(`app/report/page.tsx`). 카메라 판독이 반영된 결과라면 `fallback` 문구에 카메라에서 읽은 고민 이름이 들어갈 수 있다.
- 수집: 예. 키 설정과 상관없이 ARU 서버(`/api/reason`)까지는 전송된다. 지금은 별도 동의 단계나 끄는 선택지가 없으므로 선택 사항이 아닌 필수로 제안한다.
- 공유: 아니오로 제안. `OPENAI_API_KEY`가 설정된 동안 `app/api/reason/route.ts`가 브랜드·이름·카테고리·피부 타입·고민·예산 구간·제외 성분과 응답 언어 이름을 service provider인 OpenAI(`https://api.openai.com/v1/chat/completions`)로 보내 문구를 받는다. `fallback` 문구는 OpenAI로 보내지 않는다. 키가 없으면 라우트가 `fallback`을 그대로 돌려주고 외부로 보내지 않는다. OpenAI가 ARU 지시에 따라 처리하는 service provider라는 계약 조건을 릴리스 오너가 확인해야 한다.
- production 키 설정 여부는 저장소에서 확인할 수 없다. `docs/buildweek/SUBMISSION.md`의 “Remaining owner actions”는 2026-07-21에 Vercel production에 설정했다고 기록하고, `docs/llm-route-cost-exposure.md`(2026-09-25 측정)는 키가 설정돼 있지 않다고 적는다. 제출 전에 production 설정으로 확정한다.
- 목적: App functionality(추천 이유 문구)
- 처리: ARU는 요청 본문을 저장하지 않는다. 라우트는 OpenAI 호출이 실패하면 오류 메시지만 서버 로그에 남긴다.
- Ephemeral processing: 예로 제안. Photos 항목과 같이 공급자 설정·계약에서 보존 조건을 확인한 뒤 확정한다.
- 사용자 고지: `/privacy`는 OpenAI 전송을 AI 분석을 선택한 촬영의 얼굴 부분 이미지에 대해서만 안내한다. 이 경로의 고지나 동의 단계를 추가할지는 오너가 정한다.

### Personal info → Email address

- 수집: 예, 선택 사항
- 공유: 아니오로 제안. Supabase와 Resend가 ARU의 service provider로 처리한다는 계약 조건을 확인해야 한다.
- 목적: App functionality, Developer communications
- 처리: 사용자가 2·4주 루틴 리마인더 체크박스를 선택하고 이메일을 제출한 경우에만 저장한다.
- 보존: 4주차 발송 또는 구독 해지 후 30일에 삭제 대상. 모든 메일에 서명된 해지 링크를 포함한다.

## Not collected by the consumer release

- 전체 원본 셀피: 기본 스캔에서 저장·전송하지 않음
- 최근 결과, 체크인, 사용 시작: 브라우저 저장소에만 보관. 설문 답변도 브라우저 저장소에 보관하지만 위 “설문 기반 추천 이유 요청”의 필드는 `/report`를 열 때 전송된다.
- 앱 상호작용 funnel: 브라우저 저장소에만 보관; production 소비자 화면에서 서버 동기화하지 않음
- 정밀/대략 위치, 연락처, 금융 정보, 오디오, 파일, 광고 ID: 수집하지 않음
- 건강 정보: 위 “설문 기반 추천 이유 요청” 항목의 데이터 유형을 오너가 정한 결과에 따름
- 설치 권한: release manifest에 카메라·저장소·위치·마이크·연락처·광고 ID 권한 없음. 카메라는 Chrome의 해당 웹 origin 권한으로 요청됨.

## Owner verification before submission

- [ ] Play Console Data safety 미리보기와 이 문서를 항목별 대조
- [ ] Gemini/OpenAI, Supabase, Resend의 현재 데이터 처리 계약과 ARU 계정 설정 확인
- [ ] production 네트워크 로그로 동의 전 이미지/이메일 요청이 없음을 확인
- [ ] production `OPENAI_API_KEY` 설정 여부를 확인하고 `/api/reason` 응답의 `source`(`llm` 또는 `template`)로 대조
- [ ] 해지 즉시 발송 제외와 30일 정리 job 실증
- [ ] 개인정보처리방침의 법적 사업자명·지원 이메일 확정
