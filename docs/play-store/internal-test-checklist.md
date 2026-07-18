# Google Play internal test checklist

대상: `com.seonkistall.aru` / `1.1.0 (11000)` / target API 36

## Console owner gates

- [ ] Play Console 개발자 신원 확인 완료 및 결제 계정 긴급 알림 해결
- [ ] 계정 유형과 생성일 확인
- [ ] 2023-11-13 이후 생성된 개인 계정이면 Play Console 모바일 앱에서 실제 Android 기기 접근 검증
- [ ] 같은 조건의 개인 계정이면 closed test에 12명이 14일 연속 opt-in한 뒤 production access 신청
- [ ] 실제 개발자/법인명과 공개 지원 이메일 입력
- [ ] 앱 생성 후 Play App Signing 활성화
- [ ] Play Console의 **App signing key certificate** SHA-256을 `public/.well-known/assetlinks.json`에 추가
- [ ] upload certificate와 app-signing distribution certificate를 혼동하지 않음
- [ ] 갱신된 assetlinks 배포 후 production URL에서 200과 정확한 package/fingerprint 확인
- [ ] Data safety, 앱 접근, 콘텐츠 등급, 광고, 타깃 연령, 개인정보처리방침 제출

## Artifact gates

- [x] AAB package/version/min/target/launch URL 검사
- [x] `bundletool validate` 통과
- [x] release 서명 인증서와 upload fingerprint 일치
- [x] camera/storage/media/location/microphone/contacts/AD_ID 권한 부재
- [x] AAB native library 항목 0개로 16 KB page-size 호환성 확인
- [ ] 새 assetlinks가 반영된 최종 web commit에서 AAB 재생성 및 SHA-256 기록

## Internal track device matrix

- [ ] Galaxy S25 Edge / Android 16 / One UI 8.5에서 Play internal track 설치
- [ ] TWA 주소창이 노출되지 않음(Digital Asset Links 검증)
- [ ] 최초 카메라 권한 허용·거부·다시 묻지 않음 경로
- [ ] 전면 프리뷰 미러링, 피부 ROI 품질 게이트, 촬영 완료, 다시 촬영
- [ ] 권한 거부 후 설문 전용 완료 및 리포트 도달
- [ ] Android Back: 시트 닫기 → 이전 화면 → 앱 종료 순서
- [ ] 화면 회전, background/resume, 네트워크 단절/복구, 저메모리 재실행
- [ ] 외부 판매처 전환 후 ARU 복귀
- [ ] 전체 기기 데이터 삭제 후 재실행
- [ ] 360dp 및 큰 글자/화면 확대에서 잘림·44px 터치 영역 점검

## Play pre-launch and release gates

- [ ] Pre-launch report의 crash, ANR, accessibility, security 결과 검토
- [ ] 자동화 스크린샷에 개인정보나 촬영 프레임이 남지 않음
- [ ] 내부 테스터 피드백과 치명도 P0/P1 이슈 0건
- [ ] production rollout은 5% staged release로 시작
- [ ] crash/ANR, HTTP 5xx, 카메라 실패율을 확인한 뒤 단계 확대
- [ ] rollback 담당자와 이전 정상 AAB version code 기록

## Current official references

- [Target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-GB_ALL)
- [16 KB page-size compatibility](https://developer.android.com/guide/practices/page-sizes)
- [New personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
- [New personal-account device verification](https://support.google.com/googleplay/android-developer/answer/14316361)
