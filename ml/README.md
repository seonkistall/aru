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
training is considered.

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
