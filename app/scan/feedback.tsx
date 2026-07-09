import { useState } from "react";
import { t } from "@/lib/i18n/core";
import { cropSampleCount, exportCropSamples, saveCropSample } from "@/lib/crops";
import { exportLabels, labelCount, saveLabel, SCALES, toOrdinal, type Attr, type SampleMeta } from "@/lib/labels";
import { commitFeedbackSample, type FeedbackCommitResult } from "@/lib/feedback-storage";
import type { SkinReads } from "@/lib/skin";
import { feedBtn, stepBtn } from "./scan-styles";

// Post-scan confirm/correct step that captures the user's ground-truth label
// (and optional consented learning crop) for the ML data flywheel.
export function Feedback({ reads, cropDataUrl, captureMeta }: { reads: SkinReads; cropDataUrl: string | null; captureMeta: SampleMeta | null }) {
  const init = {
    oil: toOrdinal("oil", reads.oil.value),
    redness: toOrdinal("redness", reads.redness.value),
    pores: toOrdinal("pores", reads.pores.value),
  };
  const [stage, setStage] = useState<"ask" | "correcting" | "done">("ask");
  const [labels, setLabels] = useState(init);
  const [troubleSeen, setTroubleSeen] = useState(false);
  const [count, setCount] = useState(() => labelCount());
  const [cropCount, setCropCount] = useState(() => cropSampleCount());
  const [saveResult, setSaveResult] = useState<FeedbackCommitResult | null>(null);

  function commit(source: "confirmed" | "corrected", finalLabels: typeof init) {
    const meta: SampleMeta | undefined = captureMeta
      ? {
          ...captureMeta,
          labelConfidence: source === "confirmed" ? (reads.retakeRecommended ? "low" : "medium") : "high",
          correctionFlags: source === "corrected"
            ? {
                oil: finalLabels.oil !== init.oil,
                redness: finalLabels.redness !== init.redness,
                pores: finalLabels.pores !== init.pores,
              }
            : undefined,
          ungradable: reads.retakeRecommended && source === "confirmed",
          observations: troubleSeen ? { troubleSeen: true } : undefined,
        }
      : undefined;
    const sample = { ts: Date.now(), features: reads.raw, labels: finalLabels, source, meta };
    const result = commitFeedbackSample({ sample, cropDataUrl }, { saveLabel, saveCropSample, labelCount, cropSampleCount });
    setSaveResult(result);
    setCount(result.labelCount);
    setCropCount(result.cropCount);
    setStage("done");
  }

  const attrs: { key: Attr; label: string }[] = [
    { key: "oil", label: "유분" },
    { key: "redness", label: "붉은기" },
    { key: "pores", label: "모공" },
  ];

  return (
    <div style={{ marginTop: 22, padding: "18px 18px 20px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8 }}>
      {stage === "ask" && (
        <>
          <p style={{ fontSize: 14, color: "var(--ink)", marginBottom: 12 }}>{t("이 결과가 실제 피부와 비슷한가요?")}</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => commit("confirmed", init)} style={{ ...feedBtn, background: "var(--plum)", color: "var(--on-plum)", border: "none" }}>{t("맞아요")}</button>
            <button onClick={() => setStage("correcting")} style={feedBtn}>{t("조금 달라요")}</button>
          </div>
        </>
      )}

      {stage === "correcting" && (
        <>
          <p style={{ fontSize: 14, color: "var(--ink)", marginBottom: 12 }}>{t("실제 느낌에 맞게 고쳐주세요.")}</p>
          {attrs.map(({ key, label }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
              <span style={{ fontSize: 14, color: "var(--ink)", width: 56 }}>{t(label)}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button aria-label={t("낮추기")} onClick={() => setLabels((l) => ({ ...l, [key]: Math.max(0, l[key] - 1) }))} style={stepBtn}>-</button>
                <span style={{ fontFamily: "var(--font-ko-serif)", fontSize: 15, color: "var(--plum)", width: 108, textAlign: "center" }}>{t(SCALES[key][labels[key]])}</span>
                <button aria-label={t("높이기")} onClick={() => setLabels((l) => ({ ...l, [key]: Math.min(2, l[key] + 1) }))} style={stepBtn}>+</button>
              </div>
            </div>
          ))}
          <button onClick={() => commit("corrected", labels)} style={{ ...feedBtn, width: "100%", marginTop: 12, background: "var(--plum)", color: "var(--on-plum)", border: "none" }}>{t("저장")}</button>
        </>
      )}

      {stage !== "done" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={troubleSeen}
            onChange={(e) => setTroubleSeen(e.target.checked)}
            style={{ accentColor: "var(--ink)", width: 15, height: 15 }}
          />
          <span>{t("트러블 흔적도 보였어요")} <span style={{ color: "var(--faint)" }}>{t("선택 · 관찰 기록용")}</span></span>
        </label>
      )}

      {stage === "done" && (
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 14, color: saveResult?.ok === false ? "var(--plum-press)" : "var(--ink)" }}>
            {saveResult?.message ? t(saveResult.message) : t("고마워요. {count}번째 피부 피드백이에요.", { count })}
          </p>
          {cropDataUrl && saveResult?.cropSaved !== false && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{t("학습용 크롭 {count}개가 이 기기에 저장되어 있어요.", { count: cropCount })}</p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={exportLabels} style={{ ...feedBtn, fontSize: 13 }}>{t("라벨 내보내기")}</button>
            {cropDataUrl && <button onClick={exportCropSamples} style={{ ...feedBtn, fontSize: 13 }}>{t("크롭 내보내기")}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
