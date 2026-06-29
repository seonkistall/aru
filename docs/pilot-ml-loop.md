# Pilot and ML v1 operating loop

This is the practical plan for turning the camera into a defensible data moat.

## Pilot 0: internal device QA

Target: 5-8 internal testers.

Goals:

- Verify the camera overlay on iPhone Safari and Android Chrome.
- Tune center/distance/brightness/glare thresholds.
- Confirm consent copy is understandable.
- Confirm no bad frame produces a confident result.

Exit criteria:

- 90% of usable scans reach result without tester help.
- Bad lighting and glare reliably block capture.
- Testers can explain the difference between AI analysis and learning crop storage.

## Pilot 1: 30-person data collection

Target: 30 people, 2-3 scans each if possible.

Collect:

- `gyeol-labels` from all users who confirm/correct results.
- `gyeol-crop-samples` only from users who opted into learning crop storage.
- Participant/session IDs from `/pilot` before scanning (`P001` through `P030`).
- Capture quality metadata: mode, score, center offset, face size, brightness,
  glare ratio, dark ratio, and rejection reason when present.
- Device type, browser, lighting condition, makeup state, glasses/hair obstruction notes.
- Pilot metadata through `/pilot`, then export `gyeol-pilot-notes`.
- Consent event history through `/privacy` or `/ops`, then export `gyeol-consent-events`.

Watch during collection:

- `/ops` shows label count, crop count, pilot completion, recent consent state,
  and the current ML readiness band.
- Use `/ops` after every 5-10 participants to catch device, lighting, or consent
  drop-off before the full pilot is finished.

Run after collection:

```bash
python ml/calibrate.py gyeol-labels-*.jsonl
```

Use this phase for threshold calibration only. Do not train a CNN below 30 crop
samples.

If crop samples are available, decode and inspect the dataset:

```bash
python ml/prepare_crop_dataset.py gyeol-crop-samples-30.jsonl --out ml/data/crops
python ml/evaluate_dataset.py ml/data/crops/manifest.csv
```

## ML v1 thresholds

- Fewer than 30 crop samples: no CNN training. Use label calibration only.
- 30-99 crop samples: train script can be checked for pipeline integrity, but results are not product quality.
- 100-299 crop samples: dry-run MobileNetV3-small and inspect confusion by label.
- 300-500 crop samples: first meaningful MobileNetV3-small training and ONNX export.
- 500+ crop samples: start subgroup analysis by skin tone proxy, lighting, device, and makeup state.

Do not evaluate by random image rows when participants have multiple scans.
`train_visible_attributes.py` uses participant-grouped validation when
`participant_id` exists in the crop manifest, then falls back to random row split
only for legacy manifests.

Local browser crop storage keeps the latest 120 opted-in crops. For larger pilots,
sync to the private Supabase bucket after deletion/withdrawal procedures are ready.

The `/ops` dashboard mirrors these bands so the product team can see the next
ML action without opening a terminal.

## Research-lab experiment package

After each pilot batch, export all four files from `/ops`:

- `gyeol-labels`
- `gyeol-crop-samples`
- `gyeol-pilot-notes`
- `gyeol-consent-events`

Then run:

```bash
python ml/run_pipeline.py \
  --labels gyeol-labels-*.jsonl \
  --crops gyeol-crop-samples-*.jsonl \
  --pilot gyeol-pilot-notes-*.csv \
  --consent gyeol-consent-events-*.csv \
  --decode-crops
```

Commit or archive the generated `ml/experiments/<timestamp>/summary.json` and
`report.md` with any trained model artifact. This is the audit trail for why a
model was or was not trained.

Before training, always run:

```bash
python ml/evaluate_dataset.py ml/data/crops/manifest.csv
```

## Evaluation table

Track these for every model candidate:

| Metric | Target before shipping learned model |
|---|---|
| Oil accuracy | Better than calibrated heuristic |
| Redness accuracy | Better than calibrated heuristic |
| Pores accuracy | Better than calibrated heuristic |
| Bad-frame rejection | No confident output on poor capture |
| Skin-tone variance | No subgroup materially worse without mitigation |
| Device variance | iPhone/Android gap understood |

## Product guardrails

- The model output remains cosmetic guidance.
- Persistent redness, pain, sudden change, or severe breakouts route to professional consultation.
- Do not use terms like diagnosis, treatment, cure, removal, or guaranteed improvement.
- Keep explanation tied to visible signals and product fit.

## Data governance before backend crop sync

Backend crop storage should wait until these are implemented:

- Explicit training-use consent.
- Data retention period.
- Delete request flow.
- Export/delete account flow.
- Access control and audit trail.
- Clear policy for model retraining and opt-out.

Until then, local crop export is enough for controlled pilots.
