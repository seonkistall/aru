# Google Play Data safety worksheet

검토 기준일: 2026-07-16

대상 패키지: `com.seonkistall.aru`

대상 릴리스: `1.1.0 (11000)`

이 문서는 Play Console 입력용 작업표다. Google Play에서 “수집”은 앱에서 사용자 기기 밖으로 전송하는 행위를 포함하므로, 영구 저장하지 않는 선택형 AI 크롭도 보수적으로 포함한다. 제출 직전에 production 설정과 실제 provider 계약을 다시 확인한다.

## Data collection and security

| Play 질문 | 제안 답변 | 코드/운영 근거 |
|---|---|---|
| 앱이 사용자 데이터를 수집하거나 공유하는가 | 예 | 선택형 AI 크롭과 선택형 리마인더 이메일 |
| 전송 중 암호화되는가 | 예 | production HTTPS와 provider HTTPS API |
| 사용자가 데이터 삭제를 요청할 수 있는가 | 예 | `/privacy` 기기 데이터 삭제, 메일 원클릭 해지 후 30일 삭제 대상 |
| 계정 생성을 지원하는가 | 아니오 | ARU 소비자 플로우는 무계정 |
| 독립 보안 검토 | 아니오 | 외부 검증을 완료하기 전에는 선택하지 않음 |

## Declared data types

### Photos and videos → Photos

- 수집: 예, 선택 사항
- 공유: 아니오로 제안. Gemini/OpenAI가 ARU 지시에 따라 처리하는 service provider라는 계약 조건을 릴리스 오너가 확인해야 한다.
- 목적: App functionality
- 처리: 사용자가 “AI 분석 전송(선택)”에 동의한 경우 얼굴 주변 크롭을 분석 요청 동안만 전송한다. ARU는 이 경로에서 이미지를 영구 저장하지 않는다.
- Ephemeral processing: 예로 제안. 공급자 설정·계약에서 API 입력의 모델 학습 미사용과 요청 이후 보존 조건을 확인한 뒤 확정한다.
- 기본 온디바이스 프레임·랜드마크·설문은 기기 밖으로 전송하지 않으므로 이 선언의 대상이 아니다.

### Personal info → Email address

- 수집: 예, 선택 사항
- 공유: 아니오로 제안. Supabase와 Resend가 ARU의 service provider로 처리한다는 계약 조건을 확인해야 한다.
- 목적: App functionality, Developer communications
- 처리: 사용자가 2·4주 루틴 리마인더 체크박스를 선택하고 이메일을 제출한 경우에만 저장한다.
- 보존: 4주차 발송 또는 구독 해지 후 30일에 삭제 대상. 모든 메일에 서명된 해지 링크를 포함한다.

## Not collected by the consumer release

- 전체 원본 셀피: 기본 스캔에서 저장·전송하지 않음
- 설문 답변, 최근 결과, 체크인, 사용 시작: 브라우저 저장소에만 보관
- 앱 상호작용 funnel: 브라우저 저장소에만 보관; production 소비자 화면에서 서버 동기화하지 않음
- 정밀/대략 위치, 연락처, 금융 정보, 건강 기록, 오디오, 파일, 광고 ID: 수집하지 않음
- 설치 권한: release manifest에 카메라·저장소·위치·마이크·연락처·광고 ID 권한 없음. 카메라는 Chrome의 해당 웹 origin 권한으로 요청됨.

## Owner verification before submission

- [ ] Play Console Data safety 미리보기와 이 문서를 항목별 대조
- [ ] Gemini/OpenAI, Supabase, Resend의 현재 데이터 처리 계약과 ARU 계정 설정 확인
- [ ] production 네트워크 로그로 동의 전 이미지/이메일 요청이 없음을 확인
- [ ] 해지 즉시 발송 제외와 30일 정리 job 실증
- [ ] 개인정보처리방침의 법적 사업자명·지원 이메일 확정
