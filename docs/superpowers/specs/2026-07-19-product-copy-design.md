# ARU Consumer Product Copy Design

Date: 2026-07-19

Status: Implemented and release-gate verified in PR #57

## 1. Objective

Rewrite ARU's consumer-facing copy so that a skincare-curious user can move
from curiosity to a useful routine without encountering awkward marketing
language, developer terminology, or claims that feel stronger than the
product's evidence.

The value hierarchy is:

1. help the user explore today's skin;
2. turn that exploration into an approachable routine;
3. present product candidates as a supporting choice, not the main promise.

The default voice is friendly, conversational Korean honorific speech. ARU
asks light questions and offers help with phrases such as `같이 찾아봐요` and
`살펴볼까요?`; it does not address the user as `너`, use anxiety marketing, or
sound like a policy document.

## 2. Scope

This release covers all Production consumer surfaces:

- Home and returning-user entry points
- Scan setup, consent summary, camera states, quality guidance, and result CTA
- Survey prompts, progress, scan-assisted selections, and submit CTA
- Report analysis, recommendation basis, product candidates, comparison,
  routine, commerce, and consultation paths
- Product cards and product-use recording
- Care empty state and external destination guidance
- Reminder opt-in, reminder email templates, unsubscribe, and Check-in
- Share entry points and Studio guidance
- Privacy, data deletion, consent, retention, and medical boundaries
- Consumer-facing metadata and KO/EN/JA/ZH dictionaries
- Local template and optional LLM prompt copy that reaches consumers

Internal `/pilot`, `/ops`, and `/eval` operator copy is outside this consumer
release. Recommendation scoring, camera thresholds, data collection,
retention periods, permissions, API behavior, and product routing do not
change.

## 3. Voice rules

### Use

- Short, spoken sentences ending naturally in `-해요`, `-볼까요?`, or
  `-해 주세요`.
- `오늘의 피부`, `살펴보다`, `함께 찾아보다`, `제품 후보`, and `루틴`.
- A clear next action after an error.
- `카메라에서 확인한 특징` for consumer summaries and the more exact
  `보이는 피부 신호` only where trust or medical boundaries require it.
- `선택`, `확인`, and `삭제` in privacy copy.

### Avoid

- Anxiety or loss framing: `4만원짜리 실패는 그만`.
- Familiar second-person address: `너한테`.
- Self-congratulatory claims: `솔직하게 골라드려요`, `정직하게 읽었어요`.
- Anthropomorphic or over-technical wording: `피부를 읽다`, `crop`,
  `후속 연결`, `분석 API` in the default UI layer.
- Unqualified certainty: `딱 맞는`, `완벽한`, `정답`, guaranteed results, or
  exact diagnostic language.
- Repeated compliance warnings in the main journey. Necessary detail belongs
  behind progressive disclosure without being removed.

## 4. Home copy

| Element | Approved copy |
|---|---|
| Character annotation | `나에게 맞는 화장품 찾기,` / `30초면 충분해요.` |
| Headline | `오늘의 내 피부,` / `어떤 스킨케어가 좋을까요?` |
| Description | `AI 카메라로 지금 피부에 맞는 제품과 루틴을 함께 찾아봐요.` |
| Primary CTA | `내 피부 살펴보기` |
| Secondary CTA | `카메라 없이 설문으로 시작하기` |
| Privacy note | `사진은 기기에서 확인하고, 동의 없이 저장하지 않아요.` |

The three-step visual uses `카메라 → 설문 → 리포트` instead of technical
processing labels.

The supporting cards use:

| Card | Title | Body |
|---|---|---|
| 1 | `30초면 충분해요` | `얼굴을 가이드에 맞추면 촬영 조건을 확인한 뒤 자동으로 촬영해요.` |
| 2 | `취향을 조금 더 알려주세요` | `피부 타입, 고민, 예산을 더하면 지금 나에게 맞는 선택을 찾기 쉬워져요.` |
| 3 | `제품과 루틴을 함께 확인해요` | `오늘 살펴본 피부와 설문 답변을 바탕으로 제품 후보와 가벼운 루틴을 정리해요.` |

## 5. Scan and survey copy

| Context | Approved copy |
|---|---|
| Scan title | `오늘의 피부를 카메라로 살펴볼게요` |
| Capture lead | `얼굴을 가이드에 맞추면 빛과 각도를 확인한 뒤 자동으로 촬영해요.` |
| Ready prompt | `30초 피부 체크, 시작해볼까요?` |
| Camera CTA | `카메라로 살펴보기` |
| Survey fallback | `카메라 없이 설문으로 시작하기` |
| Ready state | `좋아요. 잠시 그대로 있어주세요.` |
| Capture failure | `피부가 선명하게 보이지 않았어요. 가이드라인에 맞춰서 밝은 곳에서 정면으로 다시 촬영해 주세요.` |
| Post-capture CTA | `설문으로 이어가기` |
| Survey title | `나에게 맞는 스킨케어를 찾아볼게요` |
| Survey lead | `피부와 취향을 조금 더 알려주세요.` |
| Scan-assisted selection | `사진에서 확인한 {signals} 항목을 먼저 선택했어요. 내 느낌과 다르면 바꿔주세요.` |
| Concern hint | `평소 신경 쓰이는 고민을 골라주세요.` |
| Incomplete state | `제품 종류, 피부 타입, 예산을 선택해 주세요.` |
| Submit CTA | `내 스킨케어 결과 보기` |

Camera quality messages keep their specific cause and corrective action:
distance, centering, light, reflection, lens clarity, or movement. They use
the same calm voice and never blame the user.

## 6. Report, products, and routine copy

| Context | Approved copy |
|---|---|
| Report title | `오늘의 피부 리포트` |
| Camera result introduction | `카메라에서 확인한 피부 특징을 설문 답변과 함께 정리했어요.` |
| Low-trust capture | `촬영 조건이 충족되지 않아 사진은 참고만 하고, 설문 답변을 중심으로 정리했어요.` |
| Survey-only result | `설문 답변을 바탕으로 나에게 맞는 스킨케어를 정리했어요.` |
| Recommendation basis | `피부 타입 {type}, 고민 {concerns}, 예산 {budget}을 함께 고려했어요. 이 조건에 가까운 {category} 제품을 최대 세 개 보여드릴게요.` |
| Camera contribution | `카메라에서 확인한 {signals}도 함께 참고했어요.` |
| Product section | `살펴볼 제품 후보` |
| Comparison lead | `예산대, 용량, 주요 성분을 비교해 보세요.` |
| Merchant note | `현재 가격, 옵션, 전성분은 판매처에서 다시 확인해 주세요.` |
| Merchant CTA | `{label}에서 제품 보기` |
| Product-use CTA | `이 제품 사용 시작하기` |
| Product-use success | `사용 시작일을 기록했어요.` |
| Routine title | `오늘부터 가볍게 시작할 루틴` |
| Follow-up title | `제품 정보나 전문가 상담이 더 궁금한가요?` |
| Follow-up lead | `추천 제품의 판매처를 확인하거나, 피부 고민이 계속되면 상담 정보를 찾아볼 수 있어요.` |
| Follow-up CTA | `제품과 상담 정보 보기` |

Dynamic product reasons remain evidence-based, describe why a candidate is
close to the selected preferences, and do not imply a purchase, efficacy, or
guaranteed fit.

## 7. Follow-up experience copy

| Context | Approved copy |
|---|---|
| Care empty state | `아직 이어서 볼 리포트가 없어요.` |
| Care start guidance | `먼저 피부를 살펴보거나 설문을 완료하면 제품 정보와 루틴을 이어서 볼 수 있어요.` |
| Merchant section | `추천 제품 더 알아보기` |
| Merchant lead | `궁금한 제품의 정보와 판매처를 한눈에 비교해 보세요.` |
| Consultation section | `피부 고민이 계속 신경 쓰인다면` |
| Reminder title | `2주 뒤, 루틴은 잘 맞는지 같이 확인해 볼까요?` |
| Reminder lead | `2주와 4주 뒤에 한 번씩 이메일로 가볍게 알려드릴게요. 원할 때 언제든 그만 받을 수 있어요.` |
| Reminder CTA | `이메일로 알림 받기` |
| Reminder success | `알림을 신청했어요. 2주 뒤에 잊지 않도록 알려드릴게요.` |
| Check-in title | `스킨케어, 직접 써보니 어땠나요?` |
| Check-in lead | `짧게 사용감을 남겨두면 내 루틴을 돌아보기 좋아요.` |
| Check-in waiting state | `2주 정도 사용해 본 뒤에 다시 물어볼게요.` |
| Feedback success | `남겨주신 피드백을 저장했어요.` |
| Check-in complete | `체크인을 모두 마쳤어요. 다음 스킨케어가 궁금할 때 다시 피부를 살펴보세요.` |
| Restart CTA | `오늘 피부 다시 살펴보기` |
| Share CTA | `오늘의 피부 리포트 공유하기` |
| Share lead | `친구도 링크에서 30초 만에 자신의 피부를 살펴볼 수 있어요.` |
| Studio edit CTA | `공유할 문구 다듬기` |

Copy must not claim that Check-in feedback changes a later recommendation
unless the recommendation engine actually consumes it.

## 8. Privacy, consent, and medical copy

The default UI uses a short summary. Provider names, exact limits, retention,
and server-deletion boundaries move into one native `<details>` element whose
summary is `데이터 처리 기준 자세히 보기`. It is collapsed by default.
Export, deletion, and consent-management controls remain visible outside this
element.

### Scan summary

`사진은 기기에서 먼저 확인해요. 전송과 저장은 선택한 경우에만 진행됩니다.`

The expanded scan sheet uses:

- `기본 촬영은 이 기기에서 처리해요.`
- `더 자세한 분석을 원할 때만 외부 AI 사용을 선택할 수 있어요.`
- `연구용 저장은 파일럿 참여자에게만 별도로 안내해요.`

### Privacy page

| Element | Approved copy |
|---|---|
| Title | `사진과 데이터는 이렇게 사용해요` |
| Lead | `기본 촬영은 기기에서 처리하고, 필요한 기능만 직접 선택할 수 있어요.` |
| Default processing title | `기기에서 먼저 확인해요` |
| Default processing body | `기본 촬영에서는 원본 사진을 외부로 보내거나 저장하지 않아요.` |
| Optional features title | `선택한 기능만 사용해요` |
| Optional features body | `AI 분석, 연구용 저장과 이메일 알림은 각각 따로 선택할 수 있어요.` |
| Data control title | `언제든 관리할 수 있어요` |
| Data control body | `이 기기에 저장된 결과와 활동 기록을 확인하거나 삭제할 수 있어요.` |
| Delete CTA | `이 기기의 ARU 데이터 모두 지우기` |

The full-delete confirmation uses:

- title: `이 기기의 데이터를 모두 지울까요?`
- body:
  `스캔 결과, 설문, 체크인과 설정이 삭제돼요. 이메일 알림과 연구 서버 데이터는 포함되지 않아요.`
- confirmation: `모두 지우기`
- success: `이 기기에 저장된 ARU 데이터를 모두 지웠어요.`

### Medical boundary

- title: `ARU는 화장품 선택을 도와드려요`
- body:
  `의료 진단이나 치료를 제공하지 않아요. 피부가 불편하거나 변화가 오래 이어지면 전문가와 상담해 주세요.`

### Unsubscribe

- title: `이메일 알림을 그만 받을까요?`
- body: `2주·4주 루틴 확인 메일을 중단해요.`
- CTA: `이메일 알림 해지하기`
- success:
  `이메일 알림을 해지했어요. 이제 2주·4주 알림을 보내지 않을게요.`
- invalid token: `이 링크는 사용할 수 없거나 유효 기간이 지났어요.`

### Reminder emails

| Message | Subject | Heading | Body | CTA |
|---|---|---|---|---|
| Week 2 | `ARU | 루틴을 시작한 지 2주가 됐어요` | `요즘 루틴은 잘 맞고 있나요?` | `잠깐 시간을 내어 지금까지의 사용감을 남겨보세요.` | `2주 체크인 남기기` |
| Week 4 | `ARU | 4주 동안의 루틴을 돌아볼까요?` | `루틴을 사용한 지 4주가 됐어요` | `지금까지의 사용감을 남기고 다음 스킨케어를 살펴보세요.` | `4주 체크인 남기기` |

Both messages use `이메일 알림 그만 받기` for the unsubscribe link. They do
not claim that submitted feedback automatically changes a later
recommendation.

### Required expanded facts

The expanded privacy section must still state, in plain language:

- Default capture stays on-device and the original full photo is not stored.
- Optional face-region transfer uses Google Gemini or OpenAI for the current
  recommendation.
- Research storage is separately consented, keeps at most 120 local samples,
  and uses a default 180-day server retention period for consented pilot data.
- Reminder records become deletion candidates within 30 days after the final
  reminder or unsubscribe.
- Local deletion does not delete reminder or pilot server data; the correct
  removal path is provided.
- Merchant clicks do not mean that a purchase occurred, and ARU stores no
  payment or order information.

## 9. Localization

Korean source strings remain the message IDs in the existing i18n system.
When a source string changes, the old EN/JA/ZH dictionary key is removed and a
new naturally authored value is added.

Translations are independently authored for each locale rather than generated
by substituting words into Korean sentence order:

- English uses short, warm, direct product language. It avoids over-familiar
  address, title case on full sentences, and phrases such as
  `Go see my skin texture`, `No exaggeration`, and `No more mistakes`.
- Japanese uses natural polite service language, appropriate particles, and
  Japanese information order. It avoids a mechanical sequence of Korean
  nouns and excessive `あなた`.
- Simplified Chinese uses concise, courteous product language and familiar
  mobile-service verbs. It avoids mechanical translations of `읽다`, `신호`,
  `정직하게`, and unnecessary repetition of `您的`.

The Home anchors establish the voice for each dictionary:

| Locale | Annotation | Headline | Primary CTA | Secondary CTA |
|---|---|---|---|---|
| EN | `Find skincare that fits you,` / `in just 30 seconds.` | `What skincare suits` / `your skin today?` | `Start my skin check` | `Start with the questionnaire` |
| JA | `自分に合うコスメ探しは、` / `30秒から。` | `今日の肌には、` / `どんなスキンケアが合いそうですか？` | `肌をチェックする` | `カメラを使わず、質問から始める` |
| ZH | `找到适合自己的护肤品，` / `30秒就够了。` | `今天的肌肤，` / `适合怎样的护肤方案？` | `看看我的肌肤状态` | `不用相机，从问卷开始` |

The remainder of each locale follows these anchors. Error messages preserve
the local convention for polite recovery instructions. Privacy and medical
copy stays calm and direct rather than becoming legalistic or playful.

Dynamic interpolation must keep variables away from locale-sensitive
particles and articles. Product and ingredient proper names continue to use
the existing canonical dictionaries.

### Text fit and character integrity

Copy is accepted only when it renders without clipping, unintended horizontal
scroll, unreadable breaks, or corrupted characters.

- Required viewports: 320 × 800 stress case, 360 × 800 Android baseline,
  393 × 873 modern phone, and 768 × 1024 tablet.
- Primary and secondary CTA labels may wrap to two lines and must retain a
  minimum 44 px target. They are never ellipsized.
- The Home annotation has an authored line break and a bounded text area; it
  must not rely on `white-space: nowrap`.
- Korean uses phrase-preserving line breaks where possible. English wraps at
  words. Japanese and Chinese use their native line-breaking behavior rather
  than `break-all`.
- Tabs, chips, cards, comparison cells, dialog actions, and form labels must
  grow or wrap without pushing controls outside their container.
- Long email addresses, provider names, and technical identifiers may use
  `overflow-wrap: anywhere`; ordinary sentences do not.
- Browser QA waits for fonts before measuring text.
- Rendered pages must not contain the Unicode replacement character `�`,
  leaked Korean message IDs in EN/JA/ZH, raw translation keys, or visibly
  corrupted byte-decoding fragments.
- Automated layout checks compare each visible text element's scroll box with
  its content box and report the route, locale, viewport, and offending copy.
- Final visual review covers every consumer route in KO/EN/JA/ZH at 360 px and
  the Home, Scan, Report, Privacy, and Check-in routes at all required
  viewports.

## 10. Implementation boundaries

Use the existing `t()` calls and dictionary files. Do not create a new copy
abstraction or content-management layer for this one-time rewrite.

Update:

- Consumer page and component source message IDs
- EN/JA/ZH dictionaries
- Recommendation and trust templates whose output is visible to users
- Reminder email templates and optional LLM prompts
- Consumer metadata
- `docs/i18n-ux-flow.md` examples that otherwise document obsolete copy

Consumer metadata uses:

- title: `ARU | 오늘의 피부에 맞는 스킨케어 찾기`
- description:
  `AI 카메라와 간단한 설문으로 오늘의 피부를 살펴보고, 제품 후보와 스킨케어 루틴을 함께 확인해 보세요.`

Do not change:

- Route structure or visual layout unless a new phrase exposes a real mobile
  overflow that requires a minimal sizing adjustment
- Data schemas, retention numbers, consent scope, or security behavior
- Recommendation ranking, camera analysis, quality thresholds, or commerce
  destinations

## 11. Error handling

Every error follows a two-part pattern:

1. explain what happened without blaming the user;
2. give one immediate recovery action.

Examples retain the specific remedy for camera distance, light, glare,
motion, storage, network, and expired links. Friendly wording must never hide
whether an operation failed.

## 12. Test-driven implementation

Before production-copy changes:

1. Add a copy-contract test that expects the approved Home, Scan, Survey,
   Report, Follow-up, Privacy, and Unsubscribe phrases.
2. Make the same test reject obsolete consumer phrases including
   `4만원짜리 실패는 그만`, `너한테 맞는 최대 셋`,
   `내 피부 결, 보러 가기`, `솔직하게 골라드려요`, and consumer-visible
   `crop`.
3. Extend dictionary coverage to Scan, Survey, Studio, reminder, and shared
   consumer components.
4. Run the focused tests and observe the expected failures.

The minimal implementation then updates only the message IDs, dictionaries,
templates, metadata, and documentation required to make those tests pass.

Verification includes:

- Focused copy-contract and dictionary tests
- Full Vitest suite
- Mobile Playwright E2E at 360 px
- Lint, TypeScript, and Next.js Production build
- Complete `npm run smoke`
- KO/EN/JA/ZH browser QA through Home, Scan, Survey, Report, Care, Check-in,
  Privacy, and Unsubscribe at the required copy-fit viewports
- Console, failed-request, overflow, clipping, CTA wrapping, accessibility
  name, character integrity, font completion, and 44 px target checks
- Production deployment canary and runtime error-log check after merge

## 13. Success criteria

The release is complete when:

- All approved Korean copy appears in the intended states.
- The named legacy phrases no longer appear on consumer surfaces, metadata,
  email, or current UX documentation.
- EN/JA/ZH are complete, natural, and free of Korean leakage.
- Privacy detail is accessible without dominating the primary flow.
- Medical and product claims remain within the PRD trust boundary.
- No user-facing Check-in or recommendation copy promises behavior the code
  does not perform.
- Full smoke and two independent browser review loops report no new failure.
- The Production deployment and canary evidence are committed without
  secrets or user data.
