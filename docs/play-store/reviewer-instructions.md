# Google Play reviewer instructions

Package: `com.seonkistall.aru`

Version: `1.1.0 (11000)`

Login: none required

Language: a fresh install opens in English. The language switcher at the top right (the button named “Language”, showing “English”) changes the app to 한국어. Labels below are the English text, with the Korean in parentheses.

## Primary review path without camera

1. Launch ARU and select **Start with the questionnaire** (카메라 없이 설문으로 시작하기).
2. Complete the short skin-preference survey.
3. Review the report with up to three cosmetic options and routine guidance.
4. At the bottom of the report, select **Privacy & consent** (개인정보와 동의) to open `/privacy`,
   then inspect or delete device-local data.

This path is fully functional without granting camera permission or providing an email.

## Optional camera path

1. From Home, select **Start my skin check** (내 피부 살펴보기).
2. Read the pre-capture explanation, then choose the camera action.
3. Chrome requests camera access for `https://aru-beauty.vercel.app`; the Android wrapper itself declares no native camera permission.
4. Use the front camera in portrait orientation. The preview is mirrored for the user. Hold the face inside the guide in soft, even light.
5. The quality gate checks face alignment, skin-region lighting, glare, and sharpness before capture. The user may retake the frame.
6. Under **Capture options** (촬영 옵션), **More detailed AI analysis** (더 자세한 AI 분석) is optional. If left unchecked, the scan continues with on-device processing.
7. Complete the survey to view the report.

If camera access is denied, unavailable, or model loading fails, use the visible survey-only fallback. The reviewer never needs to grant AI transfer consent.

## Data and email checks

- `/privacy`: inspect local counts, export eligible research records, or delete all ARU device data.
- Reminder email is optional and disabled until both an email and explicit checkbox are provided.
- Every reminder email contains a signed unsubscribe URL. Live email verification requires the release owner's verified Resend domain and test inbox.

## Restricted routes

`/ops`, `/eval`, and `/pilot` are internal research/operations tools and are blocked in production. They are not part of the consumer review path.

## External owner data still required

- Public support email: `<PLAY_SUPPORT_EMAIL_REQUIRED>`
- Developer/legal name: `<PLAY_DEVELOPER_NAME_REQUIRED>`
- Play App Signing distribution certificate fingerprint for final Digital Asset Links
