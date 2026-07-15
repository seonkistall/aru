# Mobile camera QA checklist

Use this checklist before each pilot round. Test on real devices, not only desktop
responsive mode.

## Devices

- iPhone Safari: latest iOS, front camera permission flow.
- Android Chrome: recent Samsung or Pixel class device, front camera permission flow.
- Optional: low-end Android device for camera latency and memory checks.

## Entry flow

- Open `/scan` from a fresh browser session.
- Tap `카메라 시작`.
- Confirm that the camera permission prompt appears only when the user starts the scan.
- Deny permission once and confirm the fallback route to `/survey` works.
- Allow permission and confirm the front camera opens.

## Camera framing

- Face contour surrounds the full face without cutting forehead or chin.
- Vertical center line aligns with nose/mid-face after mirror transform.
- Eye guide line sits near the eye area on both iPhone Safari and Android Chrome.
- T-zone guide lands on forehead/glabella area.
- Left/right cheek guide zones land on visible cheek skin, not eyes, lips, or hair.
- Mirroring feels natural for a selfie and does not invert the saved analysis result.
- Switch scan modes: balanced, texture, and tone. Confirm each mode changes the
  guidance text and capture gate strictness without shifting the overlay.

## Quality gates

- `얼굴`: turns on only when one face is visible.
- `중앙`: turns off when the face is far left/right or too high/low.
- `거리`: asks the user to move closer when the face is small.
- `거리`: asks the user to move back when face contour is clipped.
- `밝기`: turns off in a dim room.
- `반사`: turns off under harsh direct light or strong forehead glare.
- `안정`: turns off when the user is moving the phone.
- Capture button stays disabled until face, center, distance, brightness, and no-glare pass.
- Capture button stays disabled while the user is moving in every scan mode.
- During the scan animation, moving out of the guide should reject the scan and return to retake guidance instead of showing a confident result.
- In texture mode, steadiness should feel stricter than balanced mode.
- In tone mode, harsh glare should block capture more aggressively than balanced mode.

## Capture protocol

- Test with clean lens, smudged lens, strong backlight, window light, ceiling light.
- Test bare face and light makeup.
- Test glasses on/off.
- Test hair covering forehead.
- Confirm the app refuses or guides bad frames rather than producing confident results.

## Result flow

- Confirm the result screen appears after capture.
- Confirm debug signals are hidden for normal users and visible with `/scan?staff=1`.
- Confirm `추천 받기` saves scan confidence/source/retake data and opens `/survey`.
- Confirm low-confidence scans show `설문으로 이어가기` and keep recommendation weight on survey answers.
- Confirm result copy says reference/cosmetic guidance, not diagnosis.
- Open `/scan?debug=1` and record requested camera profile, actual video size,
  track settings, and AI/learning/model crop sizes. If actual video size is
  below 720×960 on a modern phone, treat it as a device/browser capture issue
  before tuning skin thresholds.

## Commerce flow QA

- Complete `/scan -> /survey -> /report -> /care` on iPhone Safari and Android Chrome.
- Confirm sticky report CTA opens `/api/out` and redirects to the top merchant.
- Confirm product cards use merchant labels such as `올리브영에서 보기`.
- Confirm `/care` shows Olive Young, Naver Shopping, Coupang, and Global search links for each top pick.
- Confirm link clicks open a new tab and create a local care-intent record.
- Confirm links include no diagnosis, treatment, or guaranteed-effect language.
- Confirm foreign-user copy is visible in EN mode and Global search remains available.

## Consent flow

- AI analysis checkbox and learning crop checkbox are visually separate.
- AI analysis says only face crop is sent.
- Learning crop says data stays on this device until exported.
- `/privacy` link is visible before capture.
- `/privacy` can export labels, export crops, and delete local learning data.
- Toggling either consent checkbox creates a separate local consent event with
  kind, grant/revoke status, text version, and timestamp.
- `/privacy` can export and clear the consent event log separately from learning data.

## Pilot logging

- Open `/pilot` after each participant session.
- Use roster IDs `P001` through `P030`.
- Save the participant session before opening `/scan`; labels, crops, consent
  events, and sync payloads use this participant/session link.
- Record browser/device, lighting, makeup, glasses, hair obstruction, consent
  state, reviewer ID, label completion, second-review status, exclusion reason,
  and notes.
- Export `gyeol-pilot-notes` at the end of the session.
- Keep pilot notes separate from image crops unless the participant opted into learning crop storage.
- Open `/ops` during and after the session to check label count, crop count,
  pilot completion rate, consent event count, and ML readiness band.
- For commerce validation, record whether participants expected Olive Young,
  Naver, Coupang, brand official mall, or global purchase links after the report.
- Ask whether product links felt helpful, too sales-like, or premature after a
  low-confidence scan.

## Mobile permission checklist

- Test on HTTPS or localhost; real mobile browsers block camera APIs on insecure origins.
- On iPhone Safari, test first permission grant, permission denial, page reload,
  tab background/foreground, and Settings reset.
- On Android Chrome, test first permission grant, permission denial, camera
  already in use, and browser site-settings reset.
- Record whether `facingMode: user` selected the expected front camera.
- Capture should be blocked if the real captured frame fails center, distance,
  brightness, glare, or required steadiness checks.

## Known non-goals for v1

- Do not claim acne severity diagnosis.
- Do not claim skin disease detection.
- Do not store original full-frame photos.
- Do not sync learning crops to Supabase until production consent and deletion flows are ready.

## v0.3 auto-capture (real-device checks)

- Auto-capture toggle `자동 촬영` is on by default and visible above the capture button.
- With all gates green, the 3-2-1 hand-font countdown appears after roughly 1.3s of
  sustained quality and fires the shot about 2s later (total ~3.3s from stable).
  Judge on-device whether this feels too slow/fast; timing knobs are the 2-tick arm
  threshold and the per-tick (650ms) countdown step in app/scan/page.tsx handleAutoTick.
- Breaking any gate (move, cover the lens, turn away) cancels the countdown instantly.
- After a rejected shot ("촬영 순간 품질이 흔들렸어요"), auto-capture waits ~4s before
  re-arming — confirm no rapid capture loop.
- Manual `지금 촬영하기` still works during a countdown.
- `다시 찍기` from the result screen restarts the camera with a live preview
  (regression check for the dead-black-camera fix).
- Toggling auto-capture off stops the countdown and never fires automatically.

## v0.3 xiaohei skin (real-device checks)

- Home: hand-drawn CTA border wobbles (SVG filter) and Nanum Pen headings render on
  both iOS Safari and Android Chrome (filter url(#sketch) support).
- Countdown numerals are legible over bright and dark camera scenes.
- Quality chips show green checks (not red) when passing; guide oval color steps
  red -> orange -> green as conditions improve.
- Report/care pages: 小黑 accents do not overlap text at 360px-width devices.
- Fonts: body text renders as Pretendard (self-hosted); no FOUT flash longer than ~1s
  on first load over 4G.
# Production release device matrix

Automated camera lifecycle tests do not replace real-device evidence. Do not mark a row passed without recording the physical device, OS/browser version, date, and `/scan?debug=1` output.

| Device class | Required browser | Status | Evidence |
|---|---|---|---|
| iPhone current | Safari | PENDING DEVICE VERIFICATION | Device, iOS, video/track/crop sizes, capture result |
| iPhone previous major | Safari | PENDING DEVICE VERIFICATION | Device, iOS, video/track/crop sizes, capture result |
| Samsung Galaxy current | Chrome | BASELINE PASS — ROI RETEST REQUIRED | Galaxy S25 Edge; Android 16; One UI 8.5; permission, front camera, mirroring, prior quality gate, capture, and retake passed on 2026-07-16. New skin-ROI gate still requires post-deploy physical verification. |
| Low/mid Android | Chrome | PENDING DEVICE VERIFICATION | Device, Android, gate latency, capture result |
| Desktop webcam | Chrome or Edge | PENDING DEVICE VERIFICATION | Camera, OS/browser, fallback/capture result |
