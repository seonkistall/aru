# ML roadmap for the K-beauty camera moat

The moat is not a generic public dermatology classifier. The moat is:

1. A repeatable camera capture protocol.
2. Opt-in Korean/mobile-selfie skin crops.
3. User-confirmed labels and post-purchase outcomes.
4. A small on-device model tuned on that proprietary loop.

This app now starts that loop:

- `/scan` guides users with face contour, center line, eye line, T-zone, and cheek texture zones.
- `/scan` has balanced, texture, and tone capture modes with different quality gates.
- The feedback card stores numeric labels from user confirmation/correction.
- With explicit opt-in, the app stores a compressed face crop locally and exports it as JSONL.
- `/privacy` records AI-analysis and learning-crop consent events separately.
- `/ops` shows local label/crop/pilot/consent counts and the current ML readiness band.
- `prepare_crop_dataset.py` decodes the crop JSONL into images and a manifest.
- `train_visible_attributes.py` trains a MobileNetV3-small multi-head model for oil, redness, and pores.

## Research anchors

Use these as reference points, not as a final product model:

- Fitzpatrick17k: useful for bias/fairness thinking across skin tone, but labels are clinical and web-collected, not cosmetic selfie labels.
- DDI (Diverse Dermatology Images): useful for dermatology fairness evaluation.
- HAM10000: useful as a dermoscopy benchmark, but it is not selfie/cosmetic camera data.
- ACNE04 / acne grading repos: useful for acne bootstrapping, but they do not cover K-beauty product-fit attributes.
- MobileNetV3: good starting backbone for mobile inference.
- ONNX Runtime Web: target runtime for browser inference after export.

The reviewed external dataset registry is tracked in
`ml/external_datasets.json`, with the rationale in
`docs/ml-camera-upgrade-plan.md`. External data should be used for pretraining,
camera-quality research, or fairness audits unless its license and labels
explicitly fit ARU's oil/redness/pores product task.

## Tier 1: threshold calibration

Export labels from the app and run:

```bash
python ml/calibrate.py gyeol-labels-42.jsonl
```

This updates the heuristic thresholds in `lib/skin.ts`. It is simple, explainable,
and immediately improves with real user feedback.

For a research-lab style experiment package, run:

```bash
python ml/run_pipeline.py \
  --labels gyeol-labels-42.jsonl \
  --crops gyeol-crop-samples-25.jsonl \
  --pilot gyeol-pilot-notes.csv \
  --consent gyeol-consent-events.csv \
  --decode-crops
```

This writes `ml/experiments/<timestamp>/summary.json` and `report.md` with label
distribution, source distribution, heuristic baseline confusion tables,
pilot subgroup coverage, consent state, and the next allowed ML action. It does
not train by default.

## Research pipeline runner

Use `run_pipeline.py` as the lab-grade entry point for every pilot export. It
creates a timestamped experiment directory, validates the JSONL inputs, decodes
opt-in crops into a manifest, reports label/source distribution, flags data
quality risks, and benchmarks the current heuristic thresholds before any CNN
training is considered. Low-confidence or ungradable feedback samples are
excluded by default from calibration, manifest decoding, and training.

## Axis registry, subgroups and external data

Four modules carry the rules that every other script reads:

| Module | Rule it owns |
|---|---|
| `aru_axes.py` | Which axes exist, how many ordinal levels each has, and which ones get a camera head at all. Hydration and sensitivity deliberately get none. |
| `subgroups.py` | Tone band (ITA) and age band, group-safe stratified folds, coverage warnings, worst-group selection. |
| `ita.py` | ITA from pixels, matching `dominantTone` in `lib/skin.ts` exactly so the app and the trainer agree on subgroups. |
| `licensing.py` | Whether a dataset may be used for a purpose. A dataset with no explicit tier is treated as the most restrictive one. |

### Self-check

```bash
python ml/selftest.py
```

Standard library only, no torch, and `npm run smoke` runs it. It covers the rules the
modules enforce rather than just that they parse: licence tiers and the first-party
vs external `source` distinction, ITA bands including the `toneIta` key the app
writes, age banding and the under-13 exclusion, fold leakage, worst-group skipping,
and adapter spec validation. Two shipped defects got past `py_compile` before it
existed, so add a case here whenever one of these rules changes.

### Licence gate

```bash
python ml/licensing.py --audit                       # every registered source and its tier
python ml/licensing.py --source acne04 --purpose product_training
```

Purposes split on whether the artifact ships: `product_training` and
`shipping_pretrain` ship, `research_pretrain`, `eval_audit` and `camera_qa` do not.
A CC BY-NC dataset blocks the shipping purposes, because weights are a derivative work.

### Ingesting an external dataset

Datasets are described declaratively in `ml/adapter_specs/*.json`, so adding one is
a spec file rather than a new parser. `generic_csv.json` is the template.

```bash
python ml/external_manifest.py \
  --source aihub_korean_skin \
  --root /local/path/to/dataset \
  --purpose research_pretrain \
  --compute-ita \
  --out ml/data/external
```

This writes `manifest.csv` in the same shape the trainer reads, plus
`provenance.json` recording the licence decision, the build counts and the subgroup
coverage warnings. Axes the dataset does not annotate stay empty; the trainer masks
them per sample. Never commit the downloaded images.

### Pretrain on external data, fine-tune on ARU's

Full procedure: [docs/pretrain-finetune-runbook.md](../../docs/pretrain-finetune-runbook.md).

```bash
# stage A: several external datasets at once; unlabeled axes are masked per row
python ml/train_visible_attributes.py --data ml/data/external \
  --manifest ml/data/external/aihub_korean_skin/manifest.csv \
             ml/data/external/acne04/manifest.csv \
  --axes pores wrinkles pigmentation trouble --purpose research_pretrain \
  --out-dir ml/artifacts/stageA

# stage B: fine-tune on consented crops, starting from stage A's trunk
python ml/train_visible_attributes.py --data ml/data/crops \
  --init-from ml/artifacts/stageA/visible_attr_mobilenetv3_small.pt \
  --axes oil redness pores --purpose product_training --out-dir ml/artifacts/stageB
```

Weights are a derivative work, so the gate follows them. A checkpoint records every
source it was ever trained on, `--init-from` inherits that lineage, and it is
re-checked against the new `--purpose`. Fine-tuning on spotless first-party crops
does **not** make a non-commercial pretrain shippable, and the run refuses rather
than producing weights that every per-run check called fine.

Only the trunk transfers. Heads whose shape differs between stages are dropped and
re-initialised, because a classifier sized for a different axis set is not a
head worth keeping.

### Multi-axis, subgroup-aware training

```bash
python ml/train_visible_attributes.py \
  --data ml/data/crops \
  --axes oil redness pores \
  --aux-heads tone_band age_band \
  --purpose product_training \
  --min-cell 20 --max-subgroup-gap 0.10 \
  --export-onnx
```

Defaults are unchanged: with no `--axes` the script trains the same oil/redness/pores
model as before. What is new around it:

- partial labels are masked, so an external set that only grades acne still trains;
- `--loss ordinal` (now the default) adds a distance penalty, because predicting
  level 0 for a level 2 sample is a worse error than predicting level 1;
- validation folds keep a person whole and balance subgroup cells;
- `metrics.json` reports per tone band, per age band and per joint cell, and the
  promotion gate blocks on the worst evaluated group rather than the mean;
- `tone_calibration.json` carries per-tone-band offsets the runtime can apply;
- `--weights none` trains from scratch for offline or reproducibility runs.

The gate is meant to fail loudly. "No subgroup cell reached n>=20" is a blocker, not
a pass: a model nobody could evaluate on a subgroup has not been shown to work on it.

### Read qwk and pearson, not accuracy alone — and since 2026-09-15 the gate does too

Until 2026-09-15 this section was advice: both metrics were computed and compared to
nothing, so a head that had learned nothing passed the gate, and passed it easily,
because a constant predictor has almost no subgroup gap and the gap was the only thing
the gate measured. The gate now carries a per-axis floor, `promotionGate.ordinal` in
`public/models/visible-attributes/manifest.json` (`minQwk` / `minPearson`, both 0.40,
provisional). An axis that does not report the metrics blocks as well: a bar nothing
was measured against was not cleared. Both scorers were verified against scikit-learn
and SciPy before the floor was added — `docs/ordinal-metric-verification.md`.

Every axis reports `qwk` (quadratic weighted kappa) and `pearson` alongside accuracy,
macro-F1 and ordinal MAE. On a skewed ordinal scale a model that always predicts the
majority grade scores well on accuracy, MAE and "within one grade" while carrying no
information; QWK goes to 0 for exactly that model. `within_one_grade` is recorded for
comparability with published skin-grading work, but it is never a promotion signal on
its own — the survey turned up a published case of 94% within-one-grade agreement at a
correlation of 0.25.

Since 2026-09-15 this is **enforced, not just advised**. The manifest's
`promotionGate.subgroup` carries `minQwk` and `minPearson`, and `promotion_check`
applies them per axis to the final validation confusion. Three properties worth
knowing before you tune them:

- **It fails closed, and the list is exhaustive.** An axis missing from the metrics,
  one whose entry is not a dict, one with no validation samples, and one whose
  `accuracy`, `qwk` or `pearson` is absent, non-numeric, NaN or infinite ALL block.
  "Not measured" and "fine" must not look the same in a gate. `accuracy` is in that
  list even though the floor does not apply to it, because it feeds the mean the
  subgroup gap is measured against — defaulting it to 0 would drag that mean down and
  make the gap test easier to pass.
- **The floor is per axis, not on the mean.** A strong mean cannot hide one dead head.
- **The floor is on the overall confusion, not per subgroup cell.** At
  `minSamplesPerBand: 20` a per-cell QWK is mostly noise; the subgroup rule stays the
  accuracy-gap test.

The two rules are independent on purpose. The gap test alone *rewards* a degenerate
predictor: a model that always answers level 0 is equally wrong in every cell, so it
has almost no gap between its mean and its worst group. Fed the majority-class
confusion, `metrics_from_confusion` returns accuracy 0.80, `within_one_grade` 0.95,
`qwk` 0.0 and `pearson` 0.0 — which used to pass.

### The model must beat the heuristic it would replace

Since 2026-09-15 the gate also scores the **shipped ROI heuristic** — the three
threshold pairs in `lib/skin.ts` — on the same validation rows, through the same
confusion-matrix code (`ml/heuristic_baseline.py` -> `ml/ordinal_metrics.py`), and
requires the model's `qwk` to exceed it per axis by `minQwkGainOverHeuristic`.

Every other rule asks whether the model is good in absolute terms. None of them asked
the question the gate exists for: *should this model REPLACE what already ships?* A
model can clear the subgroup gap, clear the qwk floor, and still be worse than three
numbers in a TypeScript file — and promoting it would make the product worse with every
figure in the report looking healthy.

- **0.0 means strictly greater.** A model that ties the rule it would replace has not
  earned the swap. It is 0.0 rather than a positive margin on purpose: a margin should
  exceed validation noise, and nothing here estimates that noise yet, so any specific
  margin would be an invented number.
- **Compared on `qwk`, not accuracy.** Accuracy is the metric a degenerate predictor
  wins, and a threshold rule on skewed data is itself close to degenerate.
- **An unscored heuristic blocks.** "We never scored it" must not read the same as "the
  model won". This is what correctly makes a pretrain on external data — which carries
  none of ARU's ROI features — unpromotable.
- **Both numbers must come from the same rows.** The model is scored on every labelled
  validation row; the heuristic can only be scored on labelled rows that also carry its
  ROI feature. If even one row has a label and no feature, the two qwk values describe
  different row sets and their difference is not attributable to the model, so the gate
  blocks and names the count. `skippedNoFeature` in `metrics.json` says how many, and
  the fix is the export, not the gate.
- **Only the three axes with a scalar ROI feature are covered.** The rest have no
  heuristic to beat and the gate asks nothing of them.

The thresholds live in `lib/skin.ts` and are mirrored into the manifest's
`fallbackHeuristic` block so Python can score the identical rule;
`tests/skin-index-contract.test.ts` fails if the two drift, and also checks that
applying the manifest rule to real `analyzeSkin` output reproduces the levels the app
reports, cut-point edge convention included.

`minQwk`/`minPearson` are currently **0.4, and provisional**. It is a floor against
degeneracy, not a quality claim: 0.4 sits near the fair/moderate boundary of the
commonly cited Landis & Koch kappa bands — whose *moderate* band actually begins at
0.41, and which could not be checked against its primary source from the build network
— and it has not been measured on ARU data. That bar is now enforced separately by
`minQwkGainOverHeuristic` (above), which is the rule carrying the decision.

For any axis supervised by an instrument reading rather than a human grade, report
correlation against held-out instrument values before building the head at all. Asking
whether an axis is recoverable from RGB has to come before choosing a dataset for it.

## ARU target and source registries

- `aru_target_schema.json` defines the camera targets ARU needs for cosmetic
  commerce and clinic handoff beyond oil / pores / redness.
- `source_candidates.json` records public, tooling, first-party, and private
  source candidates with license and allowed-use boundaries.
- `private_sources.example.json` is the template for licensed vendor data.
  Copy it to `ml/private_sources.json` for real contract details; the real file
  is ignored by git.

```bash
python ml/run_pipeline.py \
  --labels gyeol-labels-42.jsonl \
  --crops gyeol-crop-samples-25.jsonl \
  --name pilot-001
```

Outputs are written under `ml/experiments/<timestamp-name>/`:

- `summary.json`: machine-readable experiment summary.
- `report.md`: human-readable research review.
- `dataset/manifest.csv`: decoded opt-in crop manifest when `--crops` is passed.
- `dataset/images/`: decoded crop images when `--crops` is passed.

The runner is standard-library only and does not import torch. Training is
skipped unless explicitly requested:

```bash
python ml/run_pipeline.py \
  --labels gyeol-labels-500.jsonl \
  --crops gyeol-crop-samples-320.jsonl \
  --name mobilenetv3-v1 \
  --train \
  --export-onnx
```

By default, `--train` still skips below 300 valid decoded crops. Lowering
`--train-min-crops` is allowed for engineering smoke tests, but those runs
should not be used as product-quality evidence.

## Tier 2: opt-in crop training

1. In `/scan`, enable `학습용 크롭을 이 기기에 저장`.
2. Complete a scan.
3. Confirm or correct the result.
4. Export crop samples from the feedback card.
5. Decode them:

```bash
python ml/prepare_crop_dataset.py gyeol-crop-samples-25.jsonl --out ml/data/crops
python ml/evaluate_dataset.py ml/data/crops/manifest.csv
```

6. Train once there are enough samples:

```bash
pip install -r ml/requirements.txt
python ml/train_visible_attributes.py --data ml/data/crops --epochs 12 --export-onnx
```

The script intentionally stops if there are fewer than about 30 samples. For a real
model, aim for hundreds to thousands, with balanced labels and skin-tone coverage.
Use `run_pipeline.py` before every training run and keep the generated
`summary.json` with the model artifact.

`train_visible_attributes.py` now writes research artifacts into `--out-dir`:

- `split_train.csv` and `split_val.csv`
- `metrics.json` with loss, accuracy, macro-F1, ordinal MAE, and confusion
- checkpoint hash and ONNX hash when exported
- the exact training args, device, Python/Torch versions, and label distribution

## Research lab operating cadence

- Daily during pilot: export from `/ops`, run `ml/run_pipeline.py`, review warnings.
- Weekly: rerun `ml/calibrate.py`, compare heuristic agreement against last week.
- At 100+ crops: smoke-test training only; do not ship learned outputs.
- At 300+ crops: create the first MobileNetV3-small + ONNX candidate.
- At 500+ crops: require subgroup evaluation by lighting, device/browser, makeup,
  and skin-tone proxy before using the learned model in product flow.

## Data governance

- Default scan path: no image storage.
- AI analysis path: sends only a face crop with explicit consent.
- ML moat path: stores crop locally only with separate opt-in.
- Production storage should require clear biometric data consent, deletion, retention,
  and training-use policy before syncing crops to a backend.

## Integration target

The trained ONNX model should eventually run before the heuristic fallback:

```ts
// lib/skin.ts
const learned = await classifyVisibleAttributes(skinCrop)
if (learned) return mergeLearnedAndHeuristic(learned, heuristic)
```

Do not claim diagnosis or medical treatment. This app should describe visible
cosmetic signals and route persistent concerns to professional care.
