import { describe, expect, it } from "vitest";
import { analyzeSkin, analyzeSkinBurst } from "@/lib/skin";
import { mergeVisionAnalysis } from "@/app/scan/capture-analysis";

type LM = { x: number; y: number; z?: number };

// Region index lists copied from lib/skin.ts. TZONE and CHEEKS are disjoint, which
// is what lets a frame fail exactly one signal: the two regions can be painted and
// sampled independently. Four signals since cycle 14 — 노출 여유 joined 조명, 반사
// and 피부 영역 — and each still gets a fixture that trips it alone.
const TZONE = [9, 8, 107, 336, 151, 10, 67, 297, 1, 4, 5, 195, 197];
const CHEEKS = [50, 101, 118, 117, 116, 205, 36, 280, 330, 347, 346, 345, 425, 266];
const CHIN = [18, 200, 199, 175, 152, 83, 313];

const W = 200;
const H = 200;
const WOBBLE_REASON = "촬영 프레임 사이에 신호가 조금 흔들렸어요";

/** Top band (y < 100) is T-zone skin, bottom band is cheek skin. */
function bandFrame(tz: [number, number, number], ck: [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    const base = y < 100 ? tz : ck;
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      data[i] = base[0];
      data[i + 1] = base[1];
      data[i + 2] = base[2];
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H } as unknown as ImageData;
}

function glint(frame: ImageData, cx: number, cy: number, radius: number) {
  const d = frame.data as unknown as Uint8ClampedArray;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const o = (y * W + x) * 4;
      d[o] = 250;
      d[o + 1] = 250;
      d[o + 2] = 250;
    }
  }
}

function landmarks(cheekAt: [number, number]): LM[] {
  const lms: LM[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const i of TZONE) lms[i] = { x: 0.5, y: 0.3, z: 0 };
  for (const i of CHEEKS) lms[i] = { x: cheekAt[0], y: cheekAt[1], z: 0 };
  for (const i of CHIN) lms[i] = { x: 0.5, y: 0.85, z: 0 };
  return lms;
}

const CHEEK_OK: [number, number] = [0.5, 0.7];
// cx = cy = round(0.985 * 200) = 197, so each 9x9 patch keeps x,y in 193..199 —
// 49 px per landmark, 49 * 14 = 686 cheek samples, under the 700 floor. The T-zone
// patch is untouched at 13 * 81 = 1053, over its 500 floor.
const CHEEK_CLIPPED: [number, number] = [0.985, 0.985];

const SKIN: [number, number, number] = [196, 152, 140];
// Red pinned at the 8-bit ceiling, green and blue left alone, so the cheek's luminance
// is 0.299*255 + 0.587*150 + 0.114*138 = 180.0 — inside the 조명 band, and the only
// signal this trips is 노출 여유.
const BLOWN_RED: [number, number, number] = [255, 150, 138];
const DARK: [number, number, number] = [63, 49, 45];

describe("retakeRecommended is keyed on which signals failed", () => {
  it("does not recommend a retake when all four signals pass", () => {
    const reads = analyzeSkin(bandFrame(SKIN, SKIN), landmarks(CHEEK_OK))!;
    expect(reads.signals.filter((s) => !s.ok)).toHaveLength(0);
    expect(reads.retakeReasons).toEqual([]);
    expect(reads.retakeRecommended).toBe(false);
  });

  it("recommends a retake when 조명 alone fails", () => {
    const reads = analyzeSkin(bandFrame(DARK, DARK), landmarks(CHEEK_OK))!;
    expect(reads.signals.filter((s) => !s.ok).map((s) => s.label)).toEqual(["조명"]);
    expect(reads.raw.cheekL).toBeLessThan(70);
    expect(reads.confidence).toBeGreaterThanOrEqual(0.58);
    expect(reads.retakeReasons).toHaveLength(1);
    expect(reads.retakeRecommended).toBe(true);
  });

  it("recommends a retake when 반사 alone fails", () => {
    const frame = bandFrame(SKIN, SKIN);
    glint(frame, 100, 60, 6);
    const reads = analyzeSkin(frame, landmarks(CHEEK_OK))!;
    expect(reads.signals.filter((s) => !s.ok).map((s) => s.label)).toEqual(["반사"]);
    expect(reads.raw.tzoneSpecular).toBeGreaterThanOrEqual(0.1);
    expect(reads.confidence).toBeGreaterThanOrEqual(0.58);
    expect(reads.retakeReasons).toHaveLength(1);
    expect(reads.retakeRecommended).toBe(true);
  });

  it("recommends a retake when 노출 여유 alone fails", () => {
    // Cycle 14's fourth signal. The cheek's red channel is at 255 on every pixel of the
    // patch while its luminance stays at 180, which is exactly the case cycle 13 found
    // the other three cannot see: 조명 reads the cheek's MEAN and 반사 the T-zone's.
    const reads = analyzeSkin(bandFrame(SKIN, BLOWN_RED), landmarks(CHEEK_OK))!;
    expect(reads.signals.filter((s) => !s.ok).map((s) => s.label)).toEqual(["노출 여유"]);
    expect(reads.raw.cheekClipped).toBe(1);
    expect(reads.raw.cheekL).toBeGreaterThan(70);
    expect(reads.raw.cheekL).toBeLessThan(210);
    expect(reads.confidence).toBeGreaterThanOrEqual(0.58);
    expect(reads.retakeReasons).toHaveLength(1);
    expect(reads.retakeRecommended).toBe(true);
  });

  it("recommends a retake when 피부 영역 alone fails", () => {
    const reads = analyzeSkin(bandFrame(SKIN, SKIN), landmarks(CHEEK_CLIPPED))!;
    expect(reads.signals.filter((s) => !s.ok).map((s) => s.label)).toEqual(["피부 영역"]);
    expect(reads.raw.cheekSamples).toBe(686);
    expect(reads.raw.tzoneSamples).toBe(1053);
    expect(reads.confidence).toBeGreaterThanOrEqual(0.58);
    expect(reads.retakeReasons).toHaveLength(1);
    expect(reads.retakeRecommended).toBe(true);
  });
});

describe("the burst wobble reason is not a capture signal", () => {
  // Three flat frames whose oil and redness levels are 0, 1 and 2, so the fused
  // median lands on 1 and both agreements are 1/3; pores is flat (texture 0) in all
  // three, so its agreement is 1. meanAgreement = (1/3 + 1/3 + 1) / 3 = 0.5556,
  // under the 0.67 wobble cut, while every capture signal still passes.
  const WOBBLE_FRAMES = [
    { tz: [120, 92, 88] as [number, number, number], ck: [168, 150, 102] as [number, number, number] },
    { tz: [180, 192, 78] as [number, number, number], ck: [168, 155, 77] as [number, number, number] },
    { tz: [224, 229, 107] as [number, number, number], ck: [180, 150, 70] as [number, number, number] },
  ].map(({ tz, ck }) => ({ imageData: bandFrame(tz, ck), landmarks: landmarks(CHEEK_OK) }));

  it("wobble alone adds its reason and does NOT recommend a retake", () => {
    const reads = analyzeSkinBurst(WOBBLE_FRAMES)!;
    expect(reads.signals.filter((s) => !s.ok)).toHaveLength(0);
    const mean = (reads.burst!.agreement.oil + reads.burst!.agreement.redness + reads.burst!.agreement.pores) / 3;
    expect(mean).toBeLessThan(0.67);
    expect(reads.retakeReasons).toEqual([WOBBLE_REASON]);
    expect(reads.retakeRecommended).toBe(false);
  });

  it("one failed signal retakes with or without the wobble entry, so the rule is not a count", () => {
    const steady = [0, 1, 2].map(() => ({ imageData: bandFrame(SKIN, SKIN), landmarks: landmarks(CHEEK_CLIPPED) }));
    const steadyReads = analyzeSkinBurst(steady)!;
    expect(steadyReads.burst!.agreement.pores).toBe(1);
    expect(steadyReads.retakeReasons).toHaveLength(1);
    expect(steadyReads.retakeReasons).not.toContain(WOBBLE_REASON);
    expect(steadyReads.retakeRecommended).toBe(true);

    const wobbly = WOBBLE_FRAMES.map((frame) => ({ ...frame, landmarks: landmarks(CHEEK_CLIPPED) }));
    const wobblyReads = analyzeSkinBurst(wobbly)!;
    expect(wobblyReads.retakeReasons).toHaveLength(2);
    expect(wobblyReads.retakeReasons).toContain(WOBBLE_REASON);
    expect(wobblyReads.retakeRecommended).toBe(true);
  });
});

describe("the vision-API merge applies the same rule", () => {
  // mergeVisionAnalysis recomputes retakeRecommended whenever the payload carries any
  // confidence value. It used to count `retakeReasons`, which on the burst path also
  // holds the wobble line — so the two paths could disagree about the same capture.
  it("a vision merge over a capture failing 피부 영역 alone still recommends a retake", () => {
    const base = analyzeSkin(bandFrame(SKIN, SKIN), landmarks(CHEEK_CLIPPED))!;
    expect(base.retakeRecommended).toBe(true);
    const merged = mergeVisionAnalysis(base, { labels: { oil: 1 }, confidence: { oil: 0.9 } });
    expect(merged.confidence).toBeGreaterThanOrEqual(0.58);
    expect(merged.retakeReasons).toHaveLength(1);
    expect(merged.retakeRecommended).toBe(true);
  });

  it("a vision merge over a clean capture does not", () => {
    const base = analyzeSkin(bandFrame(SKIN, SKIN), landmarks(CHEEK_OK))!;
    const merged = mergeVisionAnalysis(base, { labels: { oil: 1 }, confidence: { oil: 0.9 } });
    expect(merged.retakeRecommended).toBe(false);
  });
});

/**
 * The 120-seed disagreement table cycle 11 chose the rule from, committed.
 *
 * That cycle measured how often a capture failing exactly one signal publishes a
 * different level from a clean capture of the same face, and the script was not kept —
 * the only decision-driving measurement in this repository that could not be re-run,
 * against the convention ml/tools/verify_tone_ita.py, ml/tools/verify_subgroup_sample_unit.py
 * and cycle 5's ARU_PRINT_SCALE_SWEEP block all keep. This is a re-derivation from the
 * description in docs/AUTOPILOT.md, not the original script, so the construction is
 * spelled out here and the numbers it prints are the ones the doc now carries:
 *
 *   - Three fixture families, one per published attribute, each tuned by bisection so
 *     the CLEAN capture's raw value sits on that attribute's lower cut point, where a
 *     nudge costs a level. oil moves the T-zone/cheek luminance ratio, redness the
 *     T-zone's red channel, pores the per-pixel noise amplitude.
 *   - 120 seeds per condition. Each seed draws one noise field, and the same field is
 *     used for the clean capture and the degraded one, so what is counted is the
 *     condition and not the noise.
 *   - A "disagreement" is the published level of the degraded capture differing from
 *     the published level of the clean capture at the same seed.
 *
 *   ARU_PRINT_RETAKE_SWEEP=1 npx vitest run tests/retake-signal-rule.test.ts
 */

const CUTS: Record<"oil" | "redness" | "pores", number> = { oil: 0.05, redness: 0.012, pores: 0.085 };
const REFERENCE_CHEEK_L = 140;
const BASE: [number, number, number] = [196, 152, 140];
const luminanceOf = (c: [number, number, number]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

type Fixture = { contrast: number; redBoost: number; noise: number };

/** One capture: a band face at `cheekL`, with seeded per-pixel noise and an optional glint. */
function noisyFrame(fixture: Fixture, cheekL: number, seed: number, glintPixels: number): ImageData {
  const gain = cheekL / luminanceOf(BASE);
  const cheek = BASE.map((v) => v * gain) as [number, number, number];
  const tzone: [number, number, number] = [
    cheek[0] * fixture.contrast + fixture.redBoost,
    cheek[1] * fixture.contrast,
    cheek[2] * fixture.contrast,
  ];
  let state = (seed * 2654435761) % 4294967296;
  const rand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    const base = y < 100 ? tzone : cheek;
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const n = (rand() - 0.5) * fixture.noise;
      data[i] = base[0] + n;
      data[i + 1] = base[1] + n;
      data[i + 2] = base[2] + n;
      data[i + 3] = 255;
    }
  }
  let painted = 0;
  for (let y = 56; y <= 64 && painted < glintPixels; y += 1) {
    for (let x = 96; x <= 104 && painted < glintPixels; x += 1) {
      const o = (y * W + x) * 4;
      data[o] = 250;
      data[o + 1] = 250;
      data[o + 2] = 250;
      painted += 1;
    }
  }
  return { data, width: W, height: H } as unknown as ImageData;
}

/** Bisect one fixture knob until the clean capture's raw value lands on its cut point. */
function tuned(attr: "oil" | "redness" | "pores"): Fixture {
  const base: Fixture = { contrast: 1, redBoost: 0, noise: 4 };
  const rawOf = (fixture: Fixture) => {
    const reads = analyzeSkin(noisyFrame(fixture, REFERENCE_CHEEK_L, 1, 0), landmarks(CHEEK_OK))!;
    return attr === "oil" ? reads.raw.shine : attr === "redness" ? reads.raw.relRedness : reads.raw.cov;
  };
  const set = (knob: number): Fixture =>
    attr === "oil" ? { ...base, contrast: 1 + knob } : attr === "redness" ? { ...base, redBoost: -knob } : { ...base, noise: knob };
  let lo = 0;
  let hi = attr === "pores" ? 120 : attr === "redness" ? 60 : 0.5;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (rawOf(set(mid)) < CUTS[attr]) lo = mid;
    else hi = mid;
  }
  return set((lo + hi) / 2);
}

describe("the 120-seed disagreement table", () => {
  it("prints the sweep the rule was chosen from", () => {
    if (!process.env.ARU_PRINT_RETAKE_SWEEP) return;
    const write = (line: string) => process.stdout.write(`RETAKE ${line}\n`);
    const attrs = ["oil", "redness", "pores"] as const;
    const conditions: Array<[string, { cheekL: number; glint: number; clipped: boolean }]> = [
      ["조명 dark", { cheekL: 60, glint: 0, clipped: false }],
      ["조명 blown out", { cheekL: 216, glint: 0, clipped: false }],
      ["반사", { cheekL: REFERENCE_CHEEK_L, glint: 24, clipped: false }],
      ["피부 영역", { cheekL: REFERENCE_CHEEK_L, glint: 0, clipped: true }],
    ];
    const fixtures = Object.fromEntries(attrs.map((attr) => [attr, tuned(attr)])) as Record<(typeof attrs)[number], Fixture>;
    for (const attr of attrs) {
      const f = fixtures[attr];
      const clean = analyzeSkin(noisyFrame(f, REFERENCE_CHEEK_L, 1, 0), landmarks(CHEEK_OK))!;
      write(
        `fixture ${attr}: contrast ${f.contrast.toFixed(6)} redBoost ${f.redBoost.toFixed(4)} noise ${f.noise.toFixed(4)}` +
          ` -> shine ${clean.raw.shine.toFixed(5)} relRedness ${clean.raw.relRedness.toFixed(5)} cov ${clean.raw.cov.toFixed(5)}`
      );
    }
    // `oil pre-fix` re-buckets the same captures on the index cycle 12 replaced,
    // `specularRatio + (tzoneL - cheekL) / 255`. It is here because cycle 11 measured
    // its table on that index, NOT as a measurement of the normalisation: these
    // fixtures are tuned at cheekL 140, the one exposure where the two formulas agree
    // by construction, so a clean capture sits on the cut under both and the counts
    // come out close for reasons that have nothing to do with invariance. What the
    // normalisation does is measured in tests/shine-exposure-scale.test.ts.
    write("condition\tattr\tcheekL range\tsignals failed\tdisagreements\toil pre-fix");
    for (const [name, condition] of conditions) {
      for (const attr of attrs) {
        let disagreements = 0;
        let preFix = 0;
        const cheekLs: number[] = [];
        const failedSets = new Set<string>();
        for (let seed = 1; seed <= 120; seed += 1) {
          const clean = analyzeSkin(noisyFrame(fixtures[attr], REFERENCE_CHEEK_L, seed, 0), landmarks(CHEEK_OK))!;
          const degraded = analyzeSkin(
            noisyFrame(fixtures[attr], condition.cheekL, seed, condition.glint),
            landmarks(condition.clipped ? CHEEK_CLIPPED : CHEEK_OK)
          )!;
          cheekLs.push(degraded.raw.cheekL);
          failedSets.add(degraded.signals.filter((signal) => !signal.ok).map((signal) => signal.label).join(",") || "none");
          if (clean[attr].value !== degraded[attr].value) disagreements += 1;
          if (attr === "oil") {
            const before = (raw: { tzoneSpecular: number; tzoneL: number; cheekL: number }) =>
              raw.tzoneSpecular + Math.max(0, (raw.tzoneL - raw.cheekL) / 255);
            const level = (v: number) => (v < CUTS.oil ? 0 : v < 0.16 ? 1 : 2);
            if (level(before(clean.raw)) !== level(before(degraded.raw))) preFix += 1;
          }
        }
        write(
          `${name}\t${attr}\t${Math.min(...cheekLs).toFixed(1)}-${Math.max(...cheekLs).toFixed(1)}` +
            `\t${[...failedSets].join(" | ")}\t${disagreements}/120\t${attr === "oil" ? `${preFix}/120` : "—"}`
        );
      }
    }
  }, 120_000);
});

/**
 * Why the 조명 rows of that sweep did not reproduce, and what a disagreement count on
 * this fixture is actually measuring.
 *
 * The backlog records the failure: re-deriving cycle 11's table brought 반사 and
 * 피부 영역 back within a handful of seeds, while 조명 came back wrong in BOTH
 * directions — dark oil 21/120 against a written 71/120, dark pores 120/120 against a
 * written 4/120. A re-derivation differing from the original is expected; differing by
 * that much, in opposite directions, on one condition only, is a question.
 *
 * The answer is in `tuned()`, not in the degradation. It bisects each fixture until the
 * CLEAN capture's raw value sits ON that attribute's cut point — at seed 1, the only
 * seed it looks at. Every other seed draws a different noise field, so the clean
 * capture lands on whichever side of the cut that field pushes it, near enough to a
 * coin flip. A disagreement is `clean.level !== degraded.level`. When the degraded
 * capture's level is PINNED (the degradation is large enough that noise cannot move it
 * off one value), the count collapses to "how many of the 120 clean captures landed on
 * the other side" — a property of the noise field, not of the condition. That is why a
 * pinned count can be too high (dark pores, 120 against 4): it is the clean split being
 * read, and the pinned degraded value decides which end it reports. It does NOT explain
 * dark oil (21 against 71): that row is not pinned, and stays open.
 * `docs/retake-sweep-what-it-measures.md`.
 *
 * `ARU_PRINT_RETAKE_SPLIT=1 npx vitest run tests/retake-signal-rule.test.ts` prints the
 * two distributions this rests on. It changes no rule and no threshold: the retake rule
 * is unaffected, because it rests on every condition costing a published reading on a
 * sixth of the seeds or more, and this says that ONE condition's exact fraction is not
 * a stable quantity, not that it is small.
 */
describe("what a 120-seed disagreement count on the tuned fixture is measuring", () => {
  it("prints the clean and degraded level distributions behind each count", () => {
    if (!process.env.ARU_PRINT_RETAKE_SPLIT) return;
    const write = (line: string) => process.stdout.write(`SPLIT ${line}\n`);
    const attrs = ["oil", "redness", "pores"] as const;
    const conditions: Array<[string, { cheekL: number; glint: number; clipped: boolean }]> = [
      ["조명 dark", { cheekL: 60, glint: 0, clipped: false }],
      ["조명 blown out", { cheekL: 216, glint: 0, clipped: false }],
      ["반사", { cheekL: REFERENCE_CHEEK_L, glint: 24, clipped: false }],
      ["피부 영역", { cheekL: REFERENCE_CHEEK_L, glint: 0, clipped: true }],
    ];
    const fixtures = Object.fromEntries(attrs.map((attr) => [attr, tuned(attr)])) as Record<(typeof attrs)[number], Fixture>;
    const tally = (levels: number[]) =>
      [0, 1, 2].map((level) => `${level}:${levels.filter((value) => value === level).length}`).join(" ");
    write("condition\tattr\tclean levels\tdegraded levels\tdegraded pinned\tdisagreements");
    for (const [name, condition] of conditions) {
      for (const attr of attrs) {
        const cleanLevels: number[] = [];
        const degradedLevels: number[] = [];
        let disagreements = 0;
        for (let seed = 1; seed <= 120; seed += 1) {
          const clean = analyzeSkin(noisyFrame(fixtures[attr], REFERENCE_CHEEK_L, seed, 0), landmarks(CHEEK_OK))!;
          const degraded = analyzeSkin(
            noisyFrame(fixtures[attr], condition.cheekL, seed, condition.glint),
            landmarks(condition.clipped ? CHEEK_CLIPPED : CHEEK_OK)
          )!;
          cleanLevels.push(clean[attr].level);
          degradedLevels.push(degraded[attr].level);
          if (clean[attr].value !== degraded[attr].value) disagreements += 1;
        }
        const pinned = new Set(degradedLevels).size === 1;
        write(
          `${name}\t${attr}\t${tally(cleanLevels)}\t${tally(degradedLevels)}` +
            `\t${pinned ? "yes" : "no"}\t${disagreements}/120`
        );
      }
    }
  }, 240_000);

  /**
   * The mechanism itself, asserted rather than printed, on the cheapest row that shows
   * it: 조명 dark + redness. Twelve seeds, not 120 — the point is not the fraction, it
   * is that the degraded level does not move while the clean level does.
   *
   * With the full 120 the identity is exact, from the printed table: 조명 dark redness
   * pins the degraded level at 1 and the clean capture splits 29/91 around its cut, and
   * the sweep reports 29/120 — the clean level-0 count, to the row. 조명 blown out
   * redness pins at 0 against the same clean split and reports 91/120, the level-1
   * count. 조명 dark pores pins at 2 against a clean split holding no 2 at all and
   * reports 120/120. In every pinned row the "disagreement count" is a readout of where
   * `tuned()`'s bisection-at-seed-1 happened to leave the CLEAN capture relative to its
   * own cut point, which is a property of one noise field and moves freely when the
   * fixture construction changes. The unpinned rows (피부 영역 on all three attributes,
   * 반사 pores, 조명 dark oil) are the ones whose count is a per-seed measurement.
   */
  it("pins the degraded level while the clean level moves, which is what the count reads", () => {
    const fixture = tuned("redness");
    const cleanLevels = new Set<number>();
    const degradedLevels = new Set<number>();
    for (let seed = 1; seed <= 12; seed += 1) {
      cleanLevels.add(analyzeSkin(noisyFrame(fixture, REFERENCE_CHEEK_L, seed, 0), landmarks(CHEEK_OK))!.redness.level);
      degradedLevels.add(analyzeSkin(noisyFrame(fixture, 60, seed, 0), landmarks(CHEEK_OK))!.redness.level);
    }
    // The clean capture straddles its cut point, because that is what `tuned()` put it on.
    expect(cleanLevels.size, "the clean capture did not straddle its cut point").toBeGreaterThan(1);
    // The degraded one does not move at all, so every seed's outcome is decided by which
    // side the CLEAN capture landed on — not by the condition under test.
    expect([...degradedLevels], "the degraded capture was not pinned to one level").toEqual([1]);
  }, 60_000);
});
