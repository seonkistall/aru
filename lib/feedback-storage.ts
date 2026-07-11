import type { CropSample } from "./crops";
import type { LabeledSample } from "./labels";

export type FeedbackSampleCommit = {
  sample: LabeledSample;
  cropDataUrl: string | null;
};

export type FeedbackStorageDeps = {
  saveLabel: (sample: LabeledSample) => boolean;
  saveCropSample: (sample: Omit<CropSample, "id">) => boolean;
  labelCount: () => number;
  cropSampleCount: () => number;
};

export type FeedbackCommitResult = {
  ok: boolean;
  labelSaved: boolean;
  cropSaved: boolean | null;
  labelCount: number;
  cropCount: number;
  message: string;
};

export function commitFeedbackSample(input: FeedbackSampleCommit, deps: FeedbackStorageDeps): FeedbackCommitResult {
  const labelSaved = deps.saveLabel(input.sample);
  const cropSaved = input.cropDataUrl
    ? deps.saveCropSample({
        image: input.cropDataUrl,
        features: input.sample.features,
        labels: input.sample.labels,
        source: input.sample.source,
        meta: input.sample.meta,
        ts: input.sample.ts,
      })
    : null;
  const labelCount = deps.labelCount();
  const cropCount = deps.cropSampleCount();
  const ok = labelSaved && cropSaved !== false;
  return {
    ok,
    labelSaved,
    cropSaved,
    labelCount,
    cropCount,
    // Korean canonical, not rendered directly — the feedback UI composes its
    // localized copy from ok/labelCount so translation stays at render time.
    message: ok ? `고마워요. ${labelCount}번째 피부 피드백이에요.` : "저장하지 못했어요. 브라우저 저장공간을 확인한 뒤 다시 시도해 주세요.",
  };
}
