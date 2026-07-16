# 재유입(리마인더) 활성화 가이드

"매일의 루틴" 재방문 훅. 사용자가 리포트에서 이메일 옵트인 → 2·4주 뒤 체크인 리마인더 메일.
**다섯 가지가 다 설정되기 전엔 아무 메일도 안 나가는 안전 무동작(no-op) 상태다.**

## 구성 요소 (이미 빌드됨)

- `/api/reengage/subscribe` — 옵트인 저장(이메일+동의, 서버측 service role, 레이트리밋). 리포트 화면의 "2주 뒤 피부 변화 리마인드 받기" 폼이 호출.
- `/api/reengage/run` — 스케줄 발송(2주/4주 도래분 조회→발송→발송표시). `CRON_SECRET` Bearer로만 접근.
- `vercel.json` — 매일 09:00(UTC) `/api/reengage/run` 크론.
- `supabase/schema.sql` — `reengage_contacts` 테이블.
- `lib/reengage.ts` — 10초 timeout과 결정적 idempotency key를 쓰는 Resend 발송 헬퍼.

## 활성화 순서 (오너)

1. **스키마**: Supabase SQL 편집기에서 `supabase/schema.sql`의 `reengage_contacts` 부분 실행(또는 전체 재실행).
2. **Resend**: [resend.com](https://resend.com) 가입 → 발신 도메인 인증 → API 키 발급.
3. **Vercel 환경변수**(aru-beauty 프로젝트):
   - `RESEND_API_KEY` = Resend 키
   - `CRON_SECRET` = 임의의 긴 랜덤 문자열(Vercel Cron이 이 값을 Bearer로 자동 첨부)
   - `UNSUBSCRIBE_SECRET` = `CRON_SECRET`과 다른 긴 랜덤 문자열(해지 링크 서명 전용)
   - `REENGAGE_FROM` = `ARU 아루 <hello@인증도메인>` (인증한 도메인이어야 발송됨)
   - `REENGAGE_LINK_BASE` = `https://aru-beauty.vercel.app` (필수, 링크 origin 고정)
4. 재배포 → 다음날 09:00부터 자동 발송. 즉시 확인하려면 대시보드 Cron에서 수동 실행.

## 검증

- `/api/reengage/run`을 `Authorization: Bearer <CRON_SECRET>` 없이 호출 → 401.
- 키/시크릿 미설정 시 → `{ ok:true, sent:0, reason:"not fully configured (no-op)" }`.
- 옵트인 → `reengage_contacts`에 행 생성 확인. 발송 후 `week2_sent_at`/`week4_sent_at` 채워짐.
- 정상 실행 응답의 `sent`, `failed`, `updateFailed`, `deleted`, `truncated`를 확인. `updateFailed > 0`이면 메일은 전송됐지만 DB 표시가 실패한 것이므로 로그의 이메일 해시를 기준으로 즉시 조사.
- 동일 연락처·동일 주차 재시도는 Resend `Idempotency-Key`로 24시간 중복 발송이 차단됨.
- 해지 링크를 눌러 `/unsubscribe` 성공 상태와 `revoked_at`, 30일 뒤 `retention_until`이 저장되는지 확인.

## 프라이버시

- 저장 PII는 이메일 + 제품 컨텍스트뿐, **명시적 동의 시에만**. 셀피·크롭과 무관.
- 모든 메일에 서명된 원클릭 해지 링크가 포함된다. 해지 즉시 발송 대상에서 제외되고 30일 뒤 연락처가 삭제 대상이 된다.
- 크론은 주차별 최대 50건, 총 실행 45초에서 안전하게 중단되며 다음 실행이 나머지를 처리한다.
