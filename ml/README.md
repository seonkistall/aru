# ML — the moat is the data, not the model

A generic skin classifier is **commodity** (anyone can train one on a public dataset,
or rent Perfect Corp). It is NOT a moat. The moat is a model trained on **proprietary
Korean-selfie + outcome data that only we collect** — a flywheel that compounds.

So we build the flywheel first, and let the model ride on it.

```
  /scan (on-device, MediaPipe + heuristics)
        │  user confirms / corrects the read  (feedback loop)
        ▼
  labeled samples  ──export──▶  gyeol-labels.jsonl   ← YOUR proprietary data
        │
        ├── Tier 1 (now):  ml/calibrate.py  → learned thresholds → lib/skin.ts
        └── Tier 2 (opt-in crops): ml/train_cnn.py → ONNX → onnxruntime-web
```

## Tier 1 — calibrate thresholds from real labels (runs today, no deps)

The heuristic reads use self-calibrated features (`shine`, `relRedness`, `cov`).
The feedback loop turns each scan into a labeled sample. Export from the app
("데이터 내보내기") and learn better thresholds:

```bash
python ml/calibrate.py gyeol-labels-42.jsonl
```

It grid-searches the `lo`/`hi` cut points per attribute that best reproduce the
human labels, and prints values to paste into `lib/skin.ts`. Re-run as you collect
more — the product gets truer to real Korean skin with every scan. Pure stdlib,
no pip install.

**This is the honest version of "tune with real faces": the faces are your users',
the labels are theirs, and the data is yours.**

## Tier 2 — train a CNN on skin crops (the bigger moat)

When you turn on opt-in crop storage (design decision **D3, path B** — explicit
consent, biometric handling), you accumulate labeled skin crops. Then train a real
visible-attribute model:

- **Model:** MobileNetV3-small (mobile/on-device), transfer learning. Reference:
  *"Acne Severity Classification on Mobile Devices"* (IJACSA v15n6 #68, MobileNetV2,
  92%, TFLite) and the Microsoft/Nestlé selfie-acne work.
- **Bootstrap data:** ACNE04 (acne grading) to warm-start; replace with your own
  labeled crops as they accumulate. Add a **non-skin rejection class** (per IEEE
  11385779, 0.97 acc with perfect non-skin rejection) so the model refuses bad frames.
- **Runtime:** export to **ONNX** → run in-browser with `onnxruntime-web` (WASM/WebGPU),
  on the MediaPipe-isolated skin crop. Wire it into
  `lib/skin.ts → classifyVisibleAttributes` (the integration point is already stubbed).

`train_cnn.py` is intentionally NOT committed with fake weights. Training needs:
a GPU (or patience on CPU), the consent-gated crop dataset, and time. Build it when
you have the data — until then, Tier 1 + heuristics ship an honest product.

### Why not just ship a public-dataset model now?
Because it would be (1) the wrong domain (acne-grade ≠ our 6 reads), (2) light-skin
biased, and (3) commodity. A read that's confidently wrong destroys the trust the
whole product depends on. Honest heuristics + a real data flywheel beat a borrowed
classifier pretending to be precise.
