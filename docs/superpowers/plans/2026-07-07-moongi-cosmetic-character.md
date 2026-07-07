# Moongi Cosmetic Character Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ARU's current in-app Xiaohei character and app icon with a Moongi-inspired cosmetic helper style using inline/static SVG assets.

**Architecture:** Keep the existing character API in `app/components/sketch.tsx` so current pages do not need layout changes. Regenerate app icon assets from the same visual language and keep icon changes static and deterministic.

**Tech Stack:** Next.js 16.2.9 App Router, React 19.2.4, TypeScript, inline SVG, static app icon assets.

## Global Constraints

- Style target: minimal, cute, clean, friendly cosmetic helper.
- Avoid bizarre, grotesque, editorial, dense diagram, or article-illustration styling.
- Do not copy image files from `moongi-xiaohei-illustrations`; adapt the style principles.
- Preserve `Xiaohei({ size, pose, bob })` unless compiler feedback requires a narrow change.
- Use existing CSS variables such as `--ink`, `--plum`, and `--orange`.
- Do not redesign layouts, recommendation logic, ML logic, survey flow, or commerce logic.
- Before editing Next.js icon behavior, check local Next.js docs. If `node_modules/next/dist/docs` is absent, limit changes to existing icon file patterns and report the gap.

---

## File Structure

- Modify `app/components/sketch.tsx`: owns reusable in-app Moongi character SVG, poses, sketch filters, and sketch box primitives.
- Modify `app/icon.svg`: owns the primary SVG app icon.
- Modify `app/apple-icon.png`: owns the iOS home-screen icon generated from the new SVG language.
- Optionally modify `app/favicon.ico`: only if it can be regenerated deterministically from the SVG icon during execution.

---

### Task 1: Update Reusable Character SVG

**Files:**
- Modify: `app/components/sketch.tsx`

**Interfaces:**
- Consumes: existing exported `Xiaohei({ size = 130, pose = "stand", bob = false })`.
- Produces: same `Xiaohei` export with poses `"magnify" | "carry" | "funnel" | "stand"`.

- [ ] **Step 1: Inspect current call sites**

Run:

```powershell
Select-String -Path app\**\*.tsx -Pattern 'Xiaohei' -CaseSensitive:$false
```

Expected: call sites use only `size`, `pose`, and `bob`.

- [ ] **Step 2: Replace the character drawing with cosmetic Moongi SVG**

In `app/components/sketch.tsx`, keep `SketchDefs`, `SketchBox`, and the `Pose` type. Replace the current `Xiaohei` implementation with a rounded cosmetic helper:

```tsx
type Pose = "magnify" | "carry" | "funnel" | "stand";

export function Xiaohei({ size = 130, pose = "stand", bob = false }: { size?: number; pose?: Pose; bob?: boolean }) {
  const ink = "var(--ink)";
  return (
    <svg
      width={size}
      height={size * 1.12}
      viewBox="0 0 120 134"
      fill="none"
      aria-hidden
      style={{ filter: "url(#sketch-soft)", animation: bob ? "gyeol-bob 2.6s ease-in-out infinite" : undefined }}
    >
      <path d="M46 96 L43 111" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M70 96 L73 111" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M39 111 C43 113 48 113 52 111" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M68 111 C72 113 77 113 81 111" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />

      <path d="M35 55 C35 38 45 28 60 28 C76 28 86 39 85 57 C86 78 77 99 60 99 C42 99 34 78 35 55 Z" fill={ink} />
      <circle cx="53" cy="56" r="4.8" fill="#fff" />
      <circle cx="67" cy="56" r="4.8" fill="#fff" />
      <path d="M54 68 Q60 72 66 68" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="45" cy="64" r="3.2" fill="rgba(255,152,140,.58)" />
      <circle cx="75" cy="64" r="3.2" fill="rgba(255,152,140,.58)" />
      <path d="M41 48 C34 47 30 43 29 38" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" />
      <path d="M80 48 C87 47 91 43 92 38" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" />

      {pose === "magnify" && (
        <>
          <path d="M81 70 L96 62" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="101" cy="52" r="12" stroke={ink} strokeWidth="2.6" fill="#fff" />
          <path d="M92 61 L86 68" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <path d="M98 52 L104 52 M101 49 L101 55" stroke="var(--plum)" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {pose === "carry" && (
        <>
          <path d="M80 72 C87 75 91 76 96 75" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <rect x="90" y="60" width="15" height="25" rx="4" stroke={ink} strokeWidth="2.4" fill="#fff" />
          <path d="M94 60 L94 55 L101 55 L101 60" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M94 71 L101 71" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="98" cy="78" r="2" fill="var(--plum)" />
        </>
      )}
      {pose === "funnel" && (
        <>
          <path d="M88 48 C97 45 106 45 114 48 L107 63 L100 63 Z" stroke={ink} strokeWidth="2.4" fill="#fff" strokeLinejoin="round" />
          <path d="M103 63 L103 78" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M94 38 L97 43 M106 36 L105 43 M116 39 L112 44" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {pose === "stand" && (
        <>
          <path d="M82 73 C89 75 93 73 96 68" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M95 60 L102 67 L93 68" stroke="var(--plum)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
```

- [ ] **Step 3: Run TypeScript/lint check**

Run:

```powershell
npm run lint
```

Expected: no lint errors from `app/components/sketch.tsx`.

- [ ] **Step 4: Commit**

```powershell
git add app/components/sketch.tsx
git commit -m "style: update moongi cosmetic character"
```

---

### Task 2: Replace App Icon Assets

**Files:**
- Modify: `app/icon.svg`
- Modify: `app/apple-icon.png`
- Optionally modify: `app/favicon.ico`

**Interfaces:**
- Consumes: Next.js existing app icon file conventions already present in the repo.
- Produces: app icon assets that visually match the updated Moongi cosmetic helper.

- [ ] **Step 1: Check Next.js docs availability**

Run:

```powershell
Test-Path -LiteralPath node_modules\next\dist\docs
```

Expected: if `False`, do not infer new icon conventions. Keep existing filenames and formats only.

- [ ] **Step 2: Replace `app/icon.svg` with the new icon SVG**

Use a white background, black rounded helper face, white eyes, blush, and a tiny cosmetic sparkle:

```svg
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="#FFFFFF"/>
  <path d="M151 227C151 148 195 101 258 101C324 101 365 151 363 232C366 326 321 410 257 410C190 410 148 326 151 227Z" fill="#171412"/>
  <circle cx="228" cy="224" r="22" fill="#FFFFFF"/>
  <circle cx="287" cy="224" r="22" fill="#FFFFFF"/>
  <path d="M230 281C245 295 270 295 286 281" stroke="#FFFFFF" stroke-width="13" stroke-linecap="round"/>
  <circle cx="190" cy="263" r="15" fill="#FF988C" fill-opacity="0.62"/>
  <circle cx="326" cy="263" r="15" fill="#FF988C" fill-opacity="0.62"/>
  <path d="M355 140L371 174L407 181L379 205L384 242L355 223L326 242L331 205L303 181L339 174L355 140Z" fill="#F47A4D"/>
  <path d="M128 183C101 177 85 159 80 135" stroke="#F47A4D" stroke-width="12" stroke-linecap="round"/>
  <path d="M384 183C411 177 427 159 432 135" stroke="#F47A4D" stroke-width="12" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 3: Regenerate `app/apple-icon.png` from `app/icon.svg`**

Preferred command if ImageMagick is available:

```powershell
magick app\icon.svg -resize 180x180 app\apple-icon.png
```

Fallback if ImageMagick is unavailable: use an installed renderer available in the workspace, and record the command in the final response.

- [ ] **Step 4: Validate files exist**

Run:

```powershell
Get-Item app\icon.svg, app\apple-icon.png | Select-Object Name, Length
```

Expected: both files exist and have non-zero length.

- [ ] **Step 5: Run build-oriented verification**

Run:

```powershell
npm run build
```

Expected: build succeeds. If dependencies are not installed, run `npm install` first only with user approval or existing permission, then rerun.

- [ ] **Step 6: Commit**

```powershell
git add app/icon.svg app/apple-icon.png app/favicon.ico
git commit -m "style: replace app icon with moongi cosmetic mark"
```

Skip `app/favicon.ico` in the `git add` command if it was not modified.

---

### Task 3: Final Smoke Verification

**Files:**
- No expected source modifications.

**Interfaces:**
- Consumes: completed Task 1 and Task 2 commits.
- Produces: verified working tree and final status report.

- [ ] **Step 1: Run smoke if dependencies are available**

Run:

```powershell
npm run smoke
```

Expected: lint, tests, build, Python compile, and route checks pass.

- [ ] **Step 2: If smoke cannot run, record the strongest completed checks**

Use this exact final report format:

```text
Verification:
- npm run lint: PASS/FAIL/SKIPPED
- npm run build: PASS/FAIL/SKIPPED
- npm run smoke: PASS/FAIL/SKIPPED
- Reason for skipped checks: <reason>
```

- [ ] **Step 3: Check working tree**

Run:

```powershell
git status --short --branch
```

Expected: clean working tree or only intentional uncommitted changes that are listed in the final response.

