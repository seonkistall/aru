# ARU Product Requirements Document

Status: Production candidate
Owner: ARU product team
Last updated: 2026-07-15

## Product promise

ARU turns an optional on-device face scan and preference survey into a practical Korean cosmetics routine. It is not a medical device, diagnosis service, or treatment recommendation system.

## Users and journeys

The primary user is a Korean-speaking mobile shopper who wants guidance without an account. The secondary user is an opted-in pilot participant. Research operators are internal users.

1. Camera: home → scan → survey → report → product/care/share → optional check-in.
2. Survey only: home → survey → report → product/care/share.
3. Research: pilot session → exact scoped consent → capture/feedback → export → server sync → offline ML evaluation.

## MVP requirements

- No account; consumer records remain local.
- Default scan stays on-device.
- AI transfer and learning-crop retention are separate explicit choices.
- Pilot consent matches participant and session.
- Camera/model failure offers survey-only continuation.
- Reports distinguish camera-applied, camera-not-applied, and survey-only results.
- Recommendations avoid diagnosis, treatment, cure, and guaranteed efficacy claims.
- Research/reminder writes use server-only credentials.
- Reminder consent can be revoked through a signed link.

## Out of scope

- Medical diagnosis, treatment, or clinical efficacy claims.
- Accounts and cross-device history.
- Learned-model publication before data-readiness gates.
- Unconsented image storage or transfer.

## Privacy and retention

- Scan/report inputs stay on the device.
- AI and learning crops require their matching grant; pilot grants are exact-session scoped.
- Reminder contacts store only email, short context, consent/delivery/revocation metadata, and retention deadline.
- Reminder contacts become eligible for deletion 30 days after week-4 delivery or revocation.

## Release gates

- RLS enabled and browser table privileges revoked.
- Public AI endpoints enforce byte, schema, rate, and timeout limits.
- MediaPipe assets served from the ARU origin.
- Lint, tests, build, ML compile, and smoke routes pass.
- Real-device evidence passes; pending evidence blocks production camera sign-off.
- Platform firewall rules protect AI and subscription endpoints.

## Metric contract

Ratios use unique `session_id` in the reporting window unless stated otherwise.

| Metric | Numerator | Denominator | Source | Target |
|---|---|---|---|---|
| Scan completion | `scan_completed` sessions | `scan_started` sessions | funnel | ≥70% |
| Capture failure | starts without completion after 3 min | `scan_started` sessions | funnel | ≤20% |
| Survey completion | `survey_completed` sessions | survey-view sessions | funnel | ≥65% |
| Report reach | `reco_viewed` sessions | `survey_completed` sessions | funnel | ≥95% |
| Retake recommendation | completions with `retake=true` | `scan_completed` sessions | funnel props | ≤25% |
| Recommendation click | `commerce_clicked` sessions | `reco_viewed` sessions | funnel | ≥15% |
| Week-2 check-in | completed eligible check-ins | opted-in contacts past week 2 | contact/check-in | ≥20% |
| AI opt-in | `ai_analysis` grants | scan starts | consent/funnel | monitor only |
| Learning opt-in | `learning_crop` grants | pilot captures | consent | monitor only |

Before production reporting, add a survey-view event. Never optimize learning-crop consent as a conversion KPI. Device segmentation must not create a stable fingerprint.

## Release ownership

The release owner applies `supabase/schema.sql`, configures firewall limits and secrets, runs physical-device QA and `npm run smoke`, verifies unsubscribe delivery, and completes `docs/production-release-checklist.md` before directing traffic.
