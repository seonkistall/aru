# Visible Skin Attribute ML Architecture

This app now treats the camera analysis as a stable ML contract, even while the
runtime falls back to calibrated ROI features until enough consented training
data exists.

## Runtime Contract

- Input: 224 x 224 face crop from the detected face box.
- Output heads: `oil`, `redness`, `pores`.
- Class values: ordinal `0`, `1`, `2`.
- Label schema: `2026-06-30.visible-face-crop.v1`.
- Product recommendation may use scan signals only when `confidence >= 0.58`
  and `retakeRecommended === false`.

## Current Runtime

1. MediaPipe Face Landmarker finds the face and sampling regions.
2. `analyzeSkin` extracts calibrated ROI features for shine, relative redness,
   texture, brightness, glare, and sample coverage.
3. `classifyVisibleAttributes` is the ONNX hook. It returns `null` until a
   trained model is available, so the calibrated ROI model remains the fallback.
4. Optional vision API output can add a narrative and only updates labels when
   its per-attribute confidence is strong enough.
5. Every labeled sample stores initial prediction, final prediction, confidence,
   model/source version, input schema, quality metadata, and retake decision.

## Training Gate

- Fewer than 30 labeled samples: do not train; adjust thresholds only.
- 100 or more consented crops: run training dry-runs and review grouped
  validation by participant.
- 300 to 500 or more consented crops: train MobileNetV3-small and export ONNX.
- Always inspect performance by lighting, skin tone proxy, device, participant,
  and retake status before promoting a model.

## Promotion Checklist

1. `ml/run_pipeline.py` produces a manifest with participant/session metadata.
2. `ml/train_visible_attributes.py` reloads the best checkpoint before ONNX
   export.
3. Exported model matches `public/models/visible-attributes/manifest.json`.
4. Browser inference must keep the same confidence/retake contract.
5. A model can only replace ROI fallback after it improves grouped validation
   and does not regress low-light or high-glare slices.
