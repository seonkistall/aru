# ARU Camera ML Upgrade Plan

Updated: 2026-09-13

## Current conclusion

The 2026-09 dataset survey ([docs/skin-dataset-survey.md](skin-dataset-survey.md))
changes one part of this and confirms the rest.

What changed: **AI-Hub 028 한국인 피부상태 측정 데이터 (dataSetSn=71645)** exists and is
a genuine candidate for product training. 1,099 Korean subjects aged 14-69, graded by
five dermatologists, captured on a smartphone as well as a DSLR, with per-subject age
and sex. It can supervise **pores, wrinkles and pigmentation** — three axes, not the
seven the product wants. Its licence tier is still unverified, so the gate in
`ml/licensing.py` currently blocks shipping use of it.

Two traps that adversarial verification caught, both worth remembering:

- its 5-grade `dryness` head is 입술건조도, **lip** dryness on the lip region, not the
  cheek and T-zone flaking ARU grades;
- 색소침착 is a discrete pigment-spot grade, not tone evenness, so it maps to the
  separate `pigmentation` axis rather than to `tone`.

What did not change, and got worse: **no public dataset supervises oil, redness,
dryness, trouble or tone evenness** under a licence that permits shipping weights.
Dermatology sets name concepts like erythema and xerosis, but those are binary lesion
descriptors on diseased skin, not cosmetic severity grades on healthy skin. Those five
axes depend entirely on ARU's own opt-in collection.

The bigger correction, added 2026-09-14: for four of the five uncovered axes the
answer is not a dataset at all. Redness, oil, tone evenness and blemish count are
measurements taken between two regions of the same frame, where the device and the
illuminant cancel. See [label-free-axes.md](label-free-axes.md) — a three-device
benchmark on the same Korean faces found the camera explains 200x more colour variance
than the subject's own skin condition, so an absolute-colour classifier mostly learns
the hardware. That also caps how much the ITA tone stratifier can be trusted: six-band
typing disagrees across devices for up to 45% of samples, though 98.3% of those land
one band away.

ARU should not train a product model directly from public dermatology datasets.
Most public skin datasets are clinical, non-commercial, gated, or focused on
diagnosis, wrinkles, spectra, or demographic skin-tone labels. They are still
valuable, but only as auxiliary inputs:

- camera quality and lighting research,
- skin-tone/fairness audits,
- weak pretraining for texture or wrinkle features,
- validation that ARU's own opt-in dataset is diverse enough.

The product model for oil, redness, and pores must be trained primarily on ARU
consented face crops with user-confirmed or corrected labels.

## External source registry

The machine-readable registry lives at `ml/external_datasets.json`. It tracks:

- access and license constraints,
- label coverage,
- allowed/recommended ARU use,
- risks that block direct product training.

Do not commit downloaded images. Store local copies under ignored experiment
directories and keep dataset terms with the experiment report.

## Sources reviewed

- SCIN: 10,000+ dermatology images from 5,000+ consented contributions, with
  dermatologist labels plus estimated Fitzpatrick and Monk Skin Tone labels.
  Source: https://github.com/google-research-datasets/scin
- ACNE04: facial acne severity dataset with ordinal severity labels; academic
  use is stated as free by the repository, while other use requires author
  contact. Source: https://github.com/xpwu95/LDL
- AcneSCU: facial acne detection dataset with non-commercial restrictions.
  Source: https://github.com/pingguokiller/acnedetection
- WIDER FACE: large-scale face detection benchmark for pose, scale, occlusion,
  and camera robustness testing, not cosmetic skin supervision. Source:
  http://shuoyang1213.me/WIDERFACE/
- LaPa: 22,000+ face parsing images with 11-category masks and 106-point
  landmarks; useful for ROI mask research under non-commercial terms. Source:
  https://github.com/jd-opensource/lapa-dataset
- FFHQ-Wrinkle: 1,000 manual wrinkle masks and 50,000 weak wrinkle masks for
  facial wrinkle segmentation. Source: https://github.com/labhai/ffhq-wrinkle-dataset
- Hyper-Skin 2023: facial RGB/VIS and MSI/NIR hyperspectral pairs from 51
  subjects, with credentialed EULA access. Source:
  https://github.com/hyperspectral-skin/Hyper-Skin-2023
- Fitzpatrick17k: 16,577 clinical images with Fitzpatrick skin type labels,
  non-commercial CC BY-NC-SA 3.0 terms in the repository. Source:
  https://github.com/mattgroh/fitzpatrick17k
- DDI: 656 pathologically confirmed clinical images curated for diverse skin
  tone dermatology bias evaluation. Source: https://arxiv.org/abs/2203.08807
- ISIC 2018 / HAM10000: 10,015 dermoscopic lesion images in the 2018 task with
  CC-BY-NC challenge terms; medical-domain only, not selfie cosmetic labels.
  Source: https://challenge.isic-archive.com/data/#2018
- FaceSkin: privacy-preserving facial skin patch dataset for attribute
  classification; availability and license need verification. Source:
  https://arxiv.org/abs/2308.04765
- MicroGlam: microscopic skin-patch cosmetics dataset under multiple lighting
  conditions; capture protocol differs from phone selfies. Source:
  https://arxiv.org/abs/2401.05339
- SkinCAP: gated dermatology caption dataset with CC BY-NC-SA 4.0 and
  research-use restrictions. Source:
  https://huggingface.co/datasets/joshuachou/SkinCAP

## ML path

1. Keep ROI heuristic as the always-on fallback.
2. Use ARU opt-in crops for the supervised labels: oil, redness, pores.
3. Run `ml/run_pipeline.py` for every export and keep its report.
4. Use external data only for camera-quality research, pretraining experiments,
   and fairness/robustness audits. Do not treat external-data results as ARU
   product performance. Product readiness can only be claimed on ARU opt-in
   crops with participant-grouped validation against the calibrated ROI baseline.
5. Train below 300 crops only for engineering smoke tests.
6. Promote an ONNX model only after it beats calibrated ROI on participant-
   grouped validation and does not regress lighting, device, makeup, or
   skin-tone proxy slices.

## Next data target

The next meaningful product milestone is not a bigger architecture; it is a
better dataset:

- 100+ opt-in crops: dry-run training and inspect confusion.
- 300+ opt-in crops: first MobileNetV3-small candidate.
- 500+ opt-in crops: subgroup evaluation before product rollout.

The scan feedback flow now opens for consented learning sessions, not only
staff mode, so normal pilot sessions can contribute labels and crops after
explicit consent.
