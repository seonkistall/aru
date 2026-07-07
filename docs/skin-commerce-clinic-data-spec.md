# ARU Skin Commerce And Clinic Data Spec

Updated: 2026-07-07

## Bottom line

For ARU to recommend cosmetics and route users to dermatology or aesthetic
clinics, oil / pores / redness are only the first layer. The camera scan should
grow into a visible-skin and intent model:

- product matching: oil, pore visibility, redness, tone evenness, pigmentation,
  texture, fine lines, blemish-like spots, dryness/flaking, sensitivity risk;
- clinic matching: user intent plus persistent/severe concern categories, not
  camera diagnosis;
- trust layer: capture quality, lighting, makeup/filter state, device, skin-tone
  proxy, reviewer confidence, and outcomes.

The machine-readable target list is `ml/aru_target_schema.json`.

## Data needed after Camera Scan

### Cosmetic purchase

- Region masks: forehead, nose, cheeks, chin, under-eye, nasolabial, jawline.
- Visible attributes: oil/shine, pore visibility, redness, tone unevenness,
  dark spots, texture roughness, fine lines/wrinkles, dryness/flaking,
  blemish-like spots, scar-like texture.
- Product constraints: allergies, fragrance sensitivity, actives already used,
  pregnancy/breastfeeding only if the product category needs it, budget, texture
  preference, climate/season, sunscreen behavior.
- Outcome labels: click, add-to-cart, purchase, return/dislike, 2-week follow-up,
  irritation follow-up.

### Dermatology / aesthetic clinic handoff

- User intent: acne, redness, pigmentation, pores/scars, wrinkles, lifting,
  under-eye, hair/removal, or general skin check.
- Severity gates: persistent duration, pain/burning/itching, sudden change,
  bleeding, scarring concern, widespread lesions, failed OTC routine.
- Camera categories: blemish-like count band, redness area, pigmentation area,
  fine-line region, scar-like texture, tone unevenness.
- Provider outcome, if legally available: provider-confirmed category and
  treatment category. Do not train medical diagnosis from consumer camera labels
  unless ARU runs a compliant clinical workflow.

## Source policy

The source can be hidden from end users, but not from ARU internally. Every
dataset needs provenance, license state, allowed use, and retention rules.
Non-commercial or academic-only data can help with research and evaluation, but
it cannot be quietly used to train a commercial model.

Use:

- `ml/source_candidates.json` for public/tooling/private-source candidates.
- `ml/private_sources.example.json` as the template for licensed vendors.
- `ml/private_sources.json` locally for real contract details; it is gitignored.

## Practical source stack

1. ARU opt-in camera panel: primary training data for product models.
2. Licensed cosmetic skin panel: primary accelerator if contract permits
   commercial ML training and derivative model weights.
3. FFHQ-Wrinkle: wrinkle/texture auxiliary research.
4. face-parsing.PyTorch / LaPa / CelebAMask-style masks: ROI and region parser
   experiments.
5. MediaPipe and RetinaFace: camera QA, face/landmark robustness, mobile
   latency baselines.
6. ACNE04 and AcneSCU: acne/blemish research benchmarks only until commercial
   permission is secured.
7. SCIN, Fitzpatrick17k, DDI, ISIC/HAM10000: fairness, tone coverage, and
   medical-boundary research, not ARU cosmetic ground truth.

## Reviewer protocol

- Use at least two reviewers for new targets until agreement is stable.
- Store both raw labels and consensus labels.
- Keep `labelConfidence=low` and `ungradable=true` samples out of default
  training.
- Track makeup, lighting, device, and skin-tone proxy slices in every report.
- Promote a model only if it beats the calibrated ROI fallback and does not
  regress any subgroup.
