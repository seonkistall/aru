import { describe, expect, it } from "vitest";
import { analyzeSkin, ATTR_THRESHOLDS } from "@/lib/skin";
import { EN } from "@/lib/i18n/en";
import { JA } from "@/lib/i18n/ja";
import { ZH } from "@/lib/i18n/zh";
import { AR } from "@/lib/i18n/ar";

/**
 * The fourth capture signal, 노출 여유, and the sweep its cut came from.
 *
 * Cycle 13 measured a defect and filed it: `relRedness` and `cov` are both read off the
 * CHEEK patch, and a warm face can pin that patch's red channel at 255 while 조명
 * (cheekL 70..210), 반사 (T-zone luminance over 218) and 피부 영역 all say ok. The
 * published pores level drops a bucket and nothing asks for a retake. Clipping even
 * delays its own nearest detector, because a clipped pixel's computed luminance is
 * lower than the scene's, so the saturating face's 반사 fails LATER than a control's.
 *
 * Cycle 14 closes it with a signal on the cheek's clipped-channel fraction. The cut is
 * derived here rather than chosen: see the table in the `ARU_PRINT_CLIP_SWEEP` case and
 * the comment on `CHEEK_CLIP_LIMIT` in lib/skin.ts, which quotes it.
 *
 * The face family is the one cycle 13's supervisor built for the R/L sweep, widened:
 * R/L 1.10..1.30 at a fixed cheek luminance, four texture amplitudes, three T-zone
 * scales. The T-zone keeps the CLIPPING fixture's per-channel offset rather than being a
 * scaled copy of the cheek, because a pure luminance scale gives rIdx(tzone) ===
 * rIdx(cheek) and so relRedness ~ 0, on which a relative tolerance means nothing.
 */

type LM = { x: number; y: number; z?: number };

const TZONE = [9, 8, 107, 336, 151, 10, 67, 297, 1, 4, 5, 195, 197];
const CHEEKS = [50, 101, 118, 117, 116, 205, 36, 280, 330, 347, 346, 345, 425, 266];
const CHIN = [18, 200, 199, 175, 152, 83, 313];

const W = 200;
const H = 200;

const lumOf = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

function hash01(x: number, y: number, seed: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

type Face = { cheek: number[]; tzone: number[]; amp: number; chroma: number };

function frameAt(face: Face, gain: number, seed = 7): ImageData {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    const base = y < 100 ? face.tzone : face.cheek;
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const n = 1 + face.amp * (2 * hash01(x, y, seed) - 1);
      for (let c = 0; c < 3; c += 1) {
        const j = 1 + face.chroma * (2 * hash01(x, y, seed + 31 * (c + 1)) - 1);
        data[i + c] = Math.round(base[c] * n * j * gain);
      }
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H } as unknown as ImageData;
}

function landmarks(): LM[] {
  const lms: LM[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const i of TZONE) lms[i] = { x: 0.5, y: 0.3, z: 0 };
  for (const i of CHEEKS) lms[i] = { x: 0.5, y: 0.7, z: 0 };
  for (const i of CHIN) lms[i] = { x: 0.5, y: 0.85, z: 0 };
  return lms;
}

function capture(face: Face, cheekTarget: number) {
  const reads = analyzeSkin(frameAt(face, cheekTarget / lumOf(face.cheek)), landmarks());
  expect(reads, `cheekL ${cheekTarget} produced no reading`).not.toBeNull();
  return reads!;
}

const CLIP_SIGNAL = "노출 여유";
const signalOf = (reads: ReturnType<typeof capture>, label: string) => {
  const signal = reads.signals.find((s) => s.label === label);
  expect(signal, `${label} is not among ${reads.signals.map((s) => s.label).join(", ")}`).toBeTruthy();
  return signal!;
};

type Attr = "oil" | "redness" | "pores";
const levelOf = (attr: Attr, value: number) => {
  const [lo, hi] = ATTR_THRESHOLDS[attr];
  return value < lo ? 0 : value < hi ? 1 : 2;
};

/** The fixture cycle 13 used, and the source of the T-zone offset every face keeps. */
const BASE: Face = { cheek: [200, 150, 138], tzone: [195, 154, 142], amp: 0.19, chroma: 0.03 };
const TZ_RATIO = BASE.tzone.map((v, i) => v / BASE.cheek[i]);

/** One face at a chosen red/luminance ratio, cheek luminance and chroma shape held fixed. */
function faceAtRL(rl: number, amp: number, tzoneScale: number): Face {
  const L = lumOf(BASE.cheek);
  const r = rl * L;
  const bOverG = BASE.cheek[2] / BASE.cheek[1];
  const g = (L - 0.299 * r) / (0.587 + 0.114 * bOverG);
  const cheek = [r, g, g * bOverG];
  return { cheek, tzone: cheek.map((v, i) => v * TZ_RATIO[i] * tzoneScale), amp, chroma: BASE.chroma };
}

const RLS = [1.1, 1.15, 1.17, 1.2, 1.223, 1.26, 1.3];
const AMPS = [0.1, 0.14, 0.19, 0.26];
const TZONE_SCALES = [0.96, 1.0, 1.04];

function family(rls = RLS, amps = AMPS, scales = TZONE_SCALES) {
  const faces: Array<{ name: string; face: Face }> = [];
  for (const rl of rls) {
    for (const amp of amps) {
      for (const ts of scales) faces.push({ name: `R/L ${rl} amp ${amp} tz ${ts}`, face: faceAtRL(rl, amp, ts) });
    }
  }
  return faces;
}

describe("노출 여유: the cheek's 8-bit ceiling", () => {
  it("measures the clipped fraction over the UNTRIMMED patch", () => {
    // `sampleRegion` trims the brightest and darkest deciles by luminance before it
    // averages, and the brightest decile is exactly where clipping lives — so a
    // fraction counted after the trim would systematically under-report the thing the
    // signal exists to see. Counted independently here over the raw 9x9 block every
    // cheek landmark of this fixture lands on.
    const face = faceAtRL(1.223, 0.19, 1.0);
    for (const target of [140, 180, 188, 196, 205]) {
      const frame = frameAt(face, target / lumOf(face.cheek)) as unknown as { data: Uint8ClampedArray };
      let clipped = 0;
      let total = 0;
      for (let y = 136; y <= 144; y += 1) {
        for (let x = 96; x <= 104; x += 1) {
          const o = (y * W + x) * 4;
          total += 1;
          if (frame.data[o] >= 255 || frame.data[o + 1] >= 255 || frame.data[o + 2] >= 255) clipped += 1;
        }
      }
      expect(capture(face, target).raw.cheekClipped, `cheekL ${target}`).toBeCloseTo(clipped / total, 10);
    }
  });

  it("counts a ceiling on ANY channel, not just on red", () => {
    // Every face in the family above is warm, so its red channel reaches 255 first and
    // a red-only test would pass all of them — checked by breaking it that way, which
    // left all other cases green. Skin is usually warm, but the signal is about sensor
    // headroom and not about skin: a strong cool cast or a white-balance error puts a
    // different channel at the ceiling first, and the indices are damaged just the same
    // (`rIdx` is a ratio over all three, and `texture` is a luminance the green channel
    // dominates at 0.587). So this face is deliberately green-dominant.
    const green: Face = { cheek: [150, 205, 140], tzone: [148, 200, 143], amp: 0.19, chroma: 0.03 };
    const countAllChannels = (target: number) => {
      const frame = frameAt(green, target / lumOf(green.cheek)) as unknown as { data: Uint8ClampedArray };
      let clipped = 0;
      let red = 0;
      let total = 0;
      for (let y = 136; y <= 144; y += 1) {
        for (let x = 96; x <= 104; x += 1) {
          const o = (y * W + x) * 4;
          total += 1;
          if (frame.data[o] >= 255) red += 1;
          if (frame.data[o] >= 255 || frame.data[o + 1] >= 255 || frame.data[o + 2] >= 255) clipped += 1;
        }
      }
      return { clipped: clipped / total, red: red / total };
    };
    let sawGreenOnly = false;
    for (const target of [140, 170, 180, 188, 196, 205]) {
      const counted = countAllChannels(target);
      expect(capture(green, target).raw.cheekClipped, `cheekL ${target}`).toBeCloseTo(counted.clipped, 10);
      if (counted.clipped > 0.05 && counted.red === 0) sawGreenOnly = true;
    }
    expect(sawGreenOnly, "the fixture never clipped a non-red channel, so this proved nothing").toBe(true);
    // And the signal fires on it, from the non-red channel alone.
    const blown = capture(green, 205);
    expect(countAllChannels(205).red).toBe(0);
    expect(signalOf(blown, CLIP_SIGNAL).ok).toBe(false);
  });

  it("never fires on a correctly-exposed capture", () => {
    // The whole lower half of the 조명 band, every face in the family. If the cut fired
    // here it would be wrong, not the rule — a retake prompt on a capture that would
    // have read correctly is the cost this cut is placed to avoid.
    for (const { name, face } of family(RLS, [0.1, 0.26], [0.96, 1.04])) {
      for (let target = 70; target <= 140; target += 10) {
        const reads = capture(face, target);
        expect(reads.raw.cheekClipped, `${name} at cheekL ${target}`).toBe(0);
        expect(signalOf(reads, CLIP_SIGNAL).ok, `${name} at cheekL ${target}`).toBe(true);
      }
    }
  });

  it("puts the cut above every capture whose indices are still inside their measured invariance", () => {
    // tests/axis-exposure-scale.test.ts measures the unclipped band at cov within 1.02x
    // and relRedness within 1.08x. Below those, clipping is indistinguishable from the
    // 8-bit rounding the indices already carry, and refusing the capture would buy
    // nothing. So: no capture the signal ACCEPTS may have left either tolerance.
    let checked = 0;
    for (const { name, face } of family(RLS, [0.19], [1.0])) {
      const reference = capture(face, 140);
      expect(reference.raw.cheekClipped, name).toBe(0);
      for (let target = 142; target <= 212; target += 2) {
        const reads = capture(face, target);
        if (!signalOf(reads, CLIP_SIGNAL).ok) continue;
        checked += 1;
        expect(
          Math.abs(reads.raw.cov / reference.raw.cov - 1),
          `${name} at cheekL ${reads.raw.cheekL.toFixed(1)} accepted with cov ${reference.raw.cov.toFixed(5)} -> ${reads.raw.cov.toFixed(5)}`
        ).toBeLessThanOrEqual(0.02);
        expect(
          Math.abs(reads.raw.relRedness / reference.raw.relRedness - 1),
          `${name} at cheekL ${reads.raw.cheekL.toFixed(1)} accepted with relRedness ${reference.raw.relRedness.toFixed(5)} -> ${reads.raw.relRedness.toFixed(5)}`
        ).toBeLessThanOrEqual(0.08);
      }
    }
    expect(checked, "the sweep accepted nothing, so it proved nothing").toBeGreaterThan(100);
  });

  it("is not stricter than the measurement asks for either", () => {
    // The other cost of the cut, and the one the cases above cannot see: a cut set far
    // below the measurement would refuse captures whose indices are provably fine, and
    // every one of those is a retake prompt on a reading that would have been correct.
    // So the signal must still ACCEPT clipping up to at least the last bucket measured
    // inside both tolerances (14.81% — 12 of the 81 pixels in the patch).
    const accepted: number[] = [];
    for (const { face } of family(RLS, [0.19], [1.0])) {
      for (let target = 142; target <= 212; target += 2) {
        const reads = capture(face, target);
        if (signalOf(reads, CLIP_SIGNAL).ok) accepted.push(reads.raw.cheekClipped);
      }
    }
    expect(Math.max(...accepted), `the highest clipped fraction still accepted: ${(Math.max(...accepted) * 100).toFixed(2)}%`).toBeGreaterThanOrEqual(
      12 / 81
    );
  });

  it("puts the cut below every capture whose published cheek level has moved", () => {
    // The other side of the same cut. Every silent published-level flip driven by
    // clipping must now be refused. Measured over the full family at cheekL 142..212:
    // 379 of the 380 flips are caught; the one miss is at cheekL 74.9 with NO clipping
    // at all (relRedness 0.01276 quantising to 0.01197 across the 0.012 cut), which is
    // the dark-end 8-bit scatter cycle 13 measured and not something this signal sees.
    let flipsFound = 0;
    for (const { name, face } of family(RLS, [0.19], [0.96, 1.0])) {
      const reference = capture(face, 140);
      const refPores = levelOf("pores", reference.raw.cov);
      const refRed = levelOf("redness", reference.raw.relRedness);
      for (let target = 142; target <= 212; target += 2) {
        const reads = capture(face, target);
        const moved =
          levelOf("pores", reads.raw.cov) !== refPores || levelOf("redness", reads.raw.relRedness) !== refRed;
        if (!moved) continue;
        flipsFound += 1;
        expect(
          signalOf(reads, CLIP_SIGNAL).ok,
          `${name} at cheekL ${reads.raw.cheekL.toFixed(1)} published a moved level with cheekClipped ${(reads.raw.cheekClipped * 100).toFixed(2)}%`
        ).toBe(false);
      }
    }
    expect(flipsFound, "no level moved anywhere, so this case proved nothing").toBeGreaterThan(20);
  });

  it("refuses the capture the three older signals published in silence", () => {
    // Cycle 13's headline row, re-read. All three of the old signals still pass on it —
    // the point of the finding was that none of them can see a saturated cheek channel.
    const reads = capture(BASE, 188);
    for (const label of ["조명", "반사", "피부 영역"]) expect(signalOf(reads, label).ok, label).toBe(true);
    expect(reads.raw.cheekClipped).toBeGreaterThan(0.2);
    expect(signalOf(reads, CLIP_SIGNAL).ok).toBe(false);
    // A failed signal forces a retake (cycle 11's rule) and states itself in the copy,
    // so the user is told which condition to fix rather than only that something failed.
    expect(reads.retakeRecommended).toBe(true);
    expect(reads.retakeReasons).toContain("볼이 너무 밝아 색이 날아갔어요");
  });

  it("translates both of its states in every shipped locale", () => {
    // Signal labels and details are raw Korean data translated at render via t(). The
    // three older ones are in every dictionary because somebody remembered; nothing
    // checked, and an untranslated one shows raw Korean in the 측정 환경 checklist.
    const clean = capture(faceAtRL(1.1, 0.19, 1.0), 140);
    const clipped = capture(BASE, 188);
    expect(signalOf(clean, CLIP_SIGNAL).ok).toBe(true);
    expect(signalOf(clipped, CLIP_SIGNAL).ok).toBe(false);
    const strings = [CLIP_SIGNAL, signalOf(clean, CLIP_SIGNAL).detail, signalOf(clipped, CLIP_SIGNAL).detail];
    expect(new Set(strings).size, strings.join(" / ")).toBe(3);
    for (const [lang, dict] of Object.entries({ en: EN, ja: JA, zh: ZH, ar: AR })) {
      for (const msgid of strings) {
        expect(dict[msgid], `"${msgid}" missing from the ${lang} dictionary`).toBeTruthy();
        expect(dict[msgid], `"${msgid}" is untranslated in ${lang}`).not.toMatch(/[가-힣]/);
      }
    }
  });

  it("keeps its false-retake band small, and roughly even across tone and texture", { timeout: 600000 }, () => {
    // Supervisor addition, 2026-09-18. The cut is sound, but a signal that refuses a
    // capture before anything about the reading is wrong spends a user's tap, and this
    // repository's whole thesis is that a measurement must not behave differently by
    // skin tone. So: how much exposure does 노출 여유 reject BEFORE either a published
    // level moves or an older signal would have caught it anyway?
    //
    // Two hypotheses were pre-registered and BOTH predicted a large effect. Rough skin
    // reaches any clipped fraction sooner, so the cost should land on high-texture
    // faces; a warm cheek clips its red channel sooner, so the cost should land on warm
    // ones. Measured on this file's own face family, neither effect is large: running
    // texture from 0.10 to 0.42 at fixed R/L moves the width by under 10 counts of
    // cheekL, and R/L 1.223 -> 1.30 moves the mean from 5.6 to 7.3, a factor of 1.30.
    //
    // (An earlier supervisor scratch fixture put that factor near 2.5. It built its
    // T-zone as a flat scale of the cheek rather than through this file's per-channel
    // TZ_RATIO, which moves where 반사 fires and so moves the window's far edge. The
    // number above is the one measured on the construction the cut was derived over;
    // the scratch one is not reproducible here and is not the repository's claim.)
    const width = (face: Face) => {
      const reference = capture(face, 140);
      const refPores = levelOf("pores", reference.raw.cov);
      const refRed = levelOf("redness", reference.raw.relRedness);
      let fires = NaN;
      let spoiled = NaN;
      for (let target = 70; target <= 214; target += 1) {
        const reads = capture(face, target);
        if (Number.isNaN(fires) && !signalOf(reads, CLIP_SIGNAL).ok) fires = reads.raw.cheekL;
        if (target < 140 || !Number.isNaN(spoiled)) continue;
        const moved =
          levelOf("pores", reads.raw.cov) !== refPores || levelOf("redness", reads.raw.relRedness) !== refRed;
        const older = ["조명", "반사", "피부 영역"].some((label) => !signalOf(reads, label).ok);
        if (moved || older) spoiled = reads.raw.cheekL;
      }
      if (Number.isNaN(fires)) return 0;
      return Math.max(0, (Number.isNaN(spoiled) ? 214 : spoiled) - fires);
    };

    // Amplitudes deliberately run past the AMPS the cut was derived over, up to a cheek
    // rough enough to publish the top pores level, so the hypothesis gets its best shot.
    const AMPS_WIDE = [0.1, 0.19, 0.26, 0.35, 0.42];
    const byRL = new Map<number, number[]>();
    const byAmp = new Map<number, number[]>();
    for (const rl of [1.223, 1.3]) {
      for (const amp of AMPS_WIDE) {
        const w = width(faceAtRL(rl, amp, 1.0));
        if (!byRL.has(rl)) byRL.set(rl, []);
        if (!byAmp.has(amp)) byAmp.set(amp, []);
        byRL.get(rl)!.push(w);
        byAmp.get(amp)!.push(w);
      }
    }
    const span = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    if (process.env.ARU_PRINT_CLIP_SWEEP) {
      for (const [rl, ws] of byRL) {
        process.stdout.write(`SWEEP false-retake width, R/L ${rl}: ${ws.map((w) => w.toFixed(1)).join(" ")} (amps ${AMPS_WIDE.join(" ")}) mean ${mean(ws).toFixed(1)}\n`);
      }
    }
    // Texture is not the driver: at a fixed R/L the whole 0.10..0.42 range fits in under
    // 10 counts of cheekL.
    for (const [rl, ws] of byRL) expect(span(ws), `R/L ${rl}: ${ws.join(" ")}`).toBeLessThan(10);
    // Warmth is a driver, but a mild one. Pinned as a BAND, not a point: this is the
    // number that would have to grow before the signal became tone-unfair, and the
    // assertion exists so a later change to the cut cannot grow it unnoticed.
    const warm = mean(byRL.get(1.3)!);
    const lessWarm = mean(byRL.get(1.223)!);
    expect(warm, `warm mean ${warm}`).toBeGreaterThan(lessWarm);
    expect(warm / lessWarm, `${lessWarm.toFixed(2)} -> ${warm.toFixed(2)}`).toBeLessThan(1.6);
    // The band is bounded: no face is refused more than 11 counts of cheekL early, and
    // every one of those exposures is well above the 140 a correct capture sits at.
    for (const ws of byRL.values()) for (const w of ws) expect(w).toBeLessThan(11);
  });

  // The sweep the cut was chosen from, committed so the table in lib/skin.ts is
  // re-runnable rather than resting on a script nobody kept:
  //   ARU_PRINT_CLIP_SWEEP=1 npx vitest run tests/cheek-clipping-signal.test.ts
  it("prints the sweep that chose the cut", { timeout: 600000 }, () => {
    if (!process.env.ARU_PRINT_CLIP_SWEEP) return;
    const write = (line: string) => process.stdout.write(`SWEEP ${line}\n`);
    const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
    type Row = { clipped: number; dCov: number; dRed: number; flip: boolean };
    const rows: Row[] = [];
    let silent = 0;
    let fires = 0;
    let flips = 0;
    let caught = 0;
    const bands = new Map<string, { n: number; fire: number }>();
    for (const { face } of family()) {
      const reference = capture(face, 140);
      if (reference.raw.cheekClipped > 0) continue;
      const refPores = levelOf("pores", reference.raw.cov);
      const refRed = levelOf("redness", reference.raw.relRedness);
      for (let target = 70; target <= 212; target += 1) {
        const reads = capture(face, target);
        const older = ["조명", "반사", "피부 영역"].every((label) => signalOf(reads, label).ok);
        if (!older) continue;
        silent += 1;
        const moved =
          levelOf("pores", reads.raw.cov) !== refPores || levelOf("redness", reads.raw.relRedness) !== refRed;
        const refused = !signalOf(reads, CLIP_SIGNAL).ok;
        if (moved) flips += 1;
        if (refused) fires += 1;
        if (moved && refused) caught += 1;
        const band = target <= 140 ? "cheekL <= 140" : target <= 170 ? "cheekL 140..170" : target <= 190 ? "cheekL 170..190" : "cheekL 190..212";
        if (!bands.has(band)) bands.set(band, { n: 0, fire: 0 });
        const b = bands.get(band)!;
        b.n += 1;
        if (refused) b.fire += 1;
        if (target >= 140) {
          rows.push({
            clipped: reads.raw.cheekClipped,
            dCov: Math.abs(reads.raw.cov / reference.raw.cov - 1),
            dRed: Math.abs(reads.raw.relRedness / reference.raw.relRedness - 1),
            flip: moved,
          });
        }
      }
    }
    write(`family ${family().length} faces; cov tolerance 2% and relRedness tolerance 8%, from tests/axis-exposure-scale.test.ts`);
    write("clipped\tn\tmax|dCov|\tmax|dRed|\tlevel flips");
    const buckets = new Map<number, Row[]>();
    for (const row of rows) {
      const k = Math.round(row.clipped * 81);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(row);
    }
    for (const k of [...buckets.keys()].sort((a, b) => a - b)) {
      if (k > 20) continue;
      const b = buckets.get(k)!;
      write(`${pct(k / 81)}\t${b.length}\t${pct(Math.max(...b.map((r) => r.dCov)))}\t${pct(Math.max(...b.map((r) => r.dRed)))}\t${b.filter((r) => r.flip).length}`);
    }
    write(`captures the three older signals pass: ${silent}`);
    write(`  newly refused: ${fires} (${pct(fires / silent)})`);
    write(`  published levels that had moved: ${flips}; caught ${caught}`);
    for (const [band, b] of bands) write(`  ${band}: ${b.fire}/${b.n} refused (${pct(b.fire / b.n)})`);
  });
});
