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
- In texture mode, capture should also wait for steadier framing.
- In tone mode, harsh glare should block capture more aggressively than balanced mode.

## Capture protocol

- Test with clean lens, smudged lens, strong backlight, window light, ceiling light.
- Test bare face and light makeup.
- Test glasses on/off.
- Test hair covering forehead.
- Confirm the app refuses or guides bad frames rather than producing confident results.

## Result flow

- Confirm the result screen appears after capture.
- Confirm debug signals are present for internal QA.
- Confirm `추천 받기` saves scan data and opens `/survey`.
- Confirm result copy says reference/cosmetic guidance, not diagnosis.

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
- Record participant code, browser/device, lighting, makeup, glasses, hair obstruction, consent state, and notes.
- Export `gyeol-pilot-notes` at the end of the session.
- Keep pilot notes separate from image crops unless the participant opted into learning crop storage.
- Open `/ops` during and after the session to check label count, crop count,
  pilot completion rate, consent event count, and ML readiness band.

## Known non-goals for v1

- Do not claim acne severity diagnosis.
- Do not claim skin disease detection.
- Do not store original full-frame photos.
- Do not sync learning crops to Supabase until production consent and deletion flows are ready.
