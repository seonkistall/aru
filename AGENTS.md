<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# K-Beauty AI: Agent Instructions

## Project Overview

**아루 ARU** is a skin analysis and product recommendation web app combining on-device
computer vision (MediaPipe), optional cloud vision APIs (Gemini/OpenAI), and a
research-grade ML training loop. It ships in five languages — English (default),
Korean, Japanese, Simplified Chinese, and Arabic with right-to-left layout.

**Core Loop:**
1. User scans face with phone camera → MediaPipe extracts skin features (oil, redness, pores)
2. Optional cloud API enrichment (Gemini-2.0-flash or GPT-4o-mini) for higher confidence
3. User fills preference survey → AI matches to Korean beauty SKUs (Olive Young, Naver, Coupang)
4. User opts into consent tracking: "AI analysis" vs "store crop for ML training"
5. Researchers export labeled crops + consent logs → offline ML pipeline trains MobileNetV3-small on K-beauty selfies

**Why This Matters:**
- On-device ML never fails (phone always computes features); cloud is best-effort enrichment
- Dual consent model (separate audit trails for AI + ML storage)
- Participant-scoped sessions (P001–P030) for 30-person research cohort
- Efficacy term filtering prevents medical claims in product recommendations

---

## Tech Stack

| Component | Version | Notes |
|-----------|---------|-------|
| Next.js | 16.2.9 | See warning above; Turbopack root pinned in `next.config.ts` |
| React | 19.2.4 | All pages use `"use client"` or server routes |
| TypeScript | ^5 | Strict mode required |
| Tailwind CSS | 4.x | PostCSS 4 (breaking changes from v3) |
| MediaPipe | 0.10.35 | WASM tasks-vision; face landmarker on-device |
| Supabase | Latest | PostgreSQL + Storage buckets (RLS policies commented out) |
| OpenAI / Gemini | Latest | Optional; async enrichment, falls back gracefully |

---

## Key Conventions

### 1. **Feature Levels & Scoring**
```typescript
// All skin features use 0-indexed ordinals (not strings)
type FeatureLevel = 0 | 1 | 2;  // low, medium, high (oil, redness, pores)

// Confidence always 0.0–1.0
type Bucket = {
  value: FeatureLevel;
  level: "낮음" | "보통" | "높음";  // Korean labels
  confidence: number;  // 0–1
};
```

### 2. **Storage Keys Naming**
```typescript
// Always prefix with gyeol_, include version
localStorage.setItem("gyeol_crop_samples_v1", jsonData);
sessionStorage.setItem("gyeol_reads_v1", jsonData);
```

### 3. **Participant ID Format**
```typescript
// Pad to 4 chars with 'P' prefix: "5" → "P005"
normalizeParticipantId("5");  // "P005"
normalizeParticipantId("P5"); // "P005"
normalizeParticipantId("P005");  // "P005" (no-op)
```

### 4. **Dual Consent Streams**
Two *independent* consents logged separately in `consent_events` table:
- `ai_analysis` – Send crop to Gemini/OpenAI
- `learning_crop` – Store crop locally for ML training

User can grant 0, 1, or both. **Must record consent BEFORE frame capture.**

### 5. **Efficacy Term Filtering**
Output from LLM product reasons must pass `efficacyClean()` check (blocks medical claims):
```typescript
// Banned: "미백", "주름개선", "치료", "효과", "효능", ...
// Allowed: "이 크림은 피부결 정돈을 돕는 성분이 들어있어요"
```

### 6. **Session-Scoped State**
Survey + scan results live in `sessionStorage`, **not URL params**:
```typescript
// User navigates /scan → /survey → /report
// All context persists in sessionStorage
// Page refresh clears everything (intended)
```

### 7. **Feature Extraction from Fixed Landmarks**
```typescript
const TZONE = [9, 8, 107, 336, ...];  // MediaPipe face mesh indices
const CHEEKS = [50, 101, 118, ...];
// Always use these arrays; don't use arbitrary indices
```

---

## Common Commands

```bash
# Development
npm run dev              # localhost:3000 (auto-reload)
npm run build           # Compile to .next/
npm run start           # Serve production build
npm run lint            # ESLint check

# Testing
npm run test            # Vitest unit + contract tests
npm run smoke           # lint + vitest + build + py_compile + ml/selftest.py + routes + mobile E2E
npm run test:mobile-ui  # Playwright mobile suite only
npm run supabase:check  # Validate Supabase config
python ml/selftest.py   # Standard-library checks for the ML rule modules (no torch needed)

# ML Pipeline (offline, after exporting from /ops)
python ml/calibrate.py gyeol-labels-42.jsonl
python ml/prepare_crop_dataset.py gyeol-crop-samples-42.jsonl --out ml/data/crops
python ml/evaluate_dataset.py ml/data/crops/manifest.csv
python ml/run_pipeline.py --labels gyeol-labels-42.jsonl --crops gyeol-crop-samples-42.jsonl --decode-crops
python ml/train_visible_attributes.py --data ml/data/crops --purpose product_training
python ml/licensing.py --audit
```

---

## Critical Pitfalls

### 🔴 High Risk
1. **Consent recorded too late** – Must check/record consent BEFORE frame capture, not after
2. **RLS policies disabled** – Dev mode has no auth enforcement; assumes trusted sync token only
3. **Efficacy terms not filtered** – New LLM reasons must pass `efficacyClean()` or medical claims slip through
4. **Session storage auto-clears** – Page refresh wipes survey + scan + reads; context not persistent
5. **Rate limit on sync** – 12 requests per 60s per origin; batch uploads, don't loop rapid calls

### ⚠️ Medium Risk
6. **Image encoding must be data URL** – Crops stored as `"data:image/jpeg;base64,..."`, not Uint8Array
7. **Quality score is composite** – All sub-checks (face, centered, distance, brightness, glare, steady) must pass
8. **Participant ID case-sensitive** – "p005" fails; must be "P005" after normalization
9. **ML training sample size matters** – <30 crops: calibration only; 300+: first production model
10. **Crop storage limit is hard** – Max 120 crops in local memory; oldest discarded when full

### 🧭 ML-specific
15. **Axes are not interchangeable with the target schema** – `ml/aru_axes.py` is what the
    training code reads; `ml/aru_target_schema.json` carries commerce and clinic handling.
    Every target declares `aruAxisId`, and `tests/ml-registry.test.ts` fails on drift.
16. **Hydration and sensitivity get no camera head** – a corneometer reading and a reaction
    history are not in an RGB frame. They are survey-gated, and the product must never
    present them as camera measurements.
17. **`source` means two things** – a registry id in an external manifest, feedback
    provenance ("user", "staff") in ARU's own export. Only `license_tier` distinguishes
    them; see `licensing.dataset_source_for_row`.
18. **Never judge an ordinal head on accuracy alone** – a majority-class predictor scores
    well on accuracy, MAE and "within one grade". Read `qwk` and `pearson`.
19. **A subgroup too small to evaluate is a blocker, not a pass** – the promotion gate
    reports it as UNEVALUATED and refuses.

### 💡 Development Issues
11. **MediaPipe WASM requires CDN** – Fails offline; needs `cdn.jsdelivr.net` access
12. **Canvas capture orientation** – Mobile portrait lock needed for consistent feature extraction
13. **Face detection latency** – 50–200ms per frame; quality gate hides UI until ready
14. **localStorage quota** – 5–10MB limit per origin; 120 crops ≈ 3.6MB

---

## Architecture & Data Flow

```
USER JOURNEY:
  Landing (/scan) 
    ↓ Camera capture (MediaPipe + quality gate)
  Scan result (/survey)
    ↓ Optional: Gemini/OpenAI enrichment
  Recommendation (/report)
    ↓ sessionStorage caches survey + reads
  Commerce (/care)
    ↓ Optional: /api/sync (if sync token + user opts in)

BACKEND API:
  /api/analyze    → Vision API call (Gemini/OpenAI base64 crop)
  /api/reason     → LLM-generated product copy (filtered)
  /api/sync       → Batch upload labels/crops/consent to Supabase
  /api/out        → Retailer click-through with attribution
  /api/reengage/* → Reminder subscribe / unsubscribe / scheduled run

OTHER CONSUMER ROUTES:
  /studio         → Shareable result card
  /checkin        → 2-/4-week follow-up
  /reco           → Legacy recommendation path, redirects to /report
  /unsubscribe    → Signed reminder opt-out

RESEARCH FLOW (404 in production unless INTERNAL_TOOLS_* is set):
  /pilot          → Create participant session (P001–P030)
  /ops            → Dashboard: label count, crop count, ML readiness band
  /eval           → Re-read harness
  /privacy        → Export JSONL/CSV or clear local data

ML PIPELINE (offline):
  Export from /ops dashboard
    ↓ calibrate.py (learn heuristic thresholds from user labels)
    ↓ prepare_crop_dataset.py (decode JSONL, generate manifest)
    ↓ evaluate_dataset.py (data quality + subgroup coverage)
    ↓ run_pipeline.py (lab entry point; wraps the above and writes an experiment report)
    ↓ train_visible_attributes.py (MobileNetV3-small, subgroup-stratified grouped CV)

  Rules live in four modules that everything else reads, never re-declares:
    aru_axes.py        which axes exist, their level counts, which get a camera head
    subgroups.py       tone band (ITA) x age band, fold assignment, coverage warnings
    ita.py             ITA from pixels, matching dominantTone in lib/skin.ts
    licensing.py       whether a dataset may be used for a given purpose
    model_contract.py  reads the shipped model manifest so training enforces its gate

  External datasets are ingested declaratively:
    external_manifest.py + adapter_specs/*.json → the same manifest shape the trainer reads

  selftest.py is the standard-library check for all of the above; npm run smoke runs it.
```

---

## Key Files to Know

| File | Purpose |
|------|---------|
| [lib/skin.ts](lib/skin.ts) | Feature extraction heuristics, ROI landmarks, quality gates |
| [lib/recommend.ts](lib/recommend.ts) | SKU matching algorithm, budget filter, concern scoring |
| [lib/supabase.ts](lib/supabase.ts) | Supabase client (public, no auth) + RLS note |
| [lib/supabase-admin.ts](lib/supabase-admin.ts) | Service-role admin client for /api/sync only |
| [app/scan/page.tsx](app/scan/page.tsx) | Camera UI, MediaPipe integration, optional Vision API call |
| [app/survey/page.tsx](app/survey/page.tsx) | Preferences form, sessionStorage persistence |
| [app/report/page.tsx](app/report/page.tsx) | Results display, LLM reasoning, efficacy filter |
| [app/api/sync/route.ts](app/api/sync/route.ts) | Batch upload endpoint, rate limiting, token validation |
| [app/ops/page.tsx](app/ops/page.tsx) | Research dashboard, ML readiness band calculation |
| [supabase/schema.sql](supabase/schema.sql) | Database schema: labels, crops, consent, pilot_notes |
| [ml/aru_axes.py](ml/aru_axes.py) | Axis registry: level counts, which axes get a camera head |
| [ml/subgroups.py](ml/subgroups.py) | Tone/age banding, leak-free stratified folds, coverage warnings |
| [ml/licensing.py](ml/licensing.py) | Dataset licence gate by purpose |
| [ml/selftest.py](ml/selftest.py) | Standard-library checks for the rule modules |
| [lib/tone-bands.ts](lib/tone-bands.ts) | Browser-side tone bands, kept in step with ml/subgroups.py |
| [docs/skin-dataset-survey.md](docs/skin-dataset-survey.md) | What public data can and cannot supervise |

---

## ML Readiness Bands

The `/ops` dashboard tracks data maturity for ML training:

| Crops | Band | Action |
|-------|------|--------|
| <30 | Calibration | Validate heuristics only; no model training |
| 30–99 | Integrity Check | Pipeline validation; early quality signals |
| 100–299 | Dry Run | Full pipeline, benchmark heuristics vs random forest |
| 300–500 | Production | MobileNetV3-small training (participant-grouped CV) |
| 500+ | Subgroup Analysis | Stratify by device, lighting, skin tone, makeup |

**Rule:** Don't train below 300 crops; don't publish below 500.

---

## Environment Setup

### Required for Local Dev
```bash
npm install
npm run dev
```

### Optional: Vision API Enhancement
Set in `.env.local`:
```
GEMINI_API_KEY=...         # Gemini 2.0 Flash
OPENAI_API_KEY=...         # GPT-4o-mini
```
If omitted, app falls back to on-device heuristics only (no degradation).

### For Sync Endpoint (Research Mode)
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_SYNC_TOKEN=...
SUPABASE_CROP_BUCKET=gyeol-crop-samples
SUPABASE_SYNC_ALLOWED_ORIGINS=http://localhost:3000
```

### ML Pipeline (Python)
See [ml/README.md](ml/README.md) for setup; requires PyTorch, TorchVision, ONNX.

---

## When You Get Stuck

1. **"Consent not recorded?"** → Check if consent event logged BEFORE frame capture, not after
2. **"Medical claim in reason?"** → Likely a banned efficacy term; run through `efficacyClean()`
3. **"Quality score too low?"** → All sub-checks must pass; check MediaPipe confidence + landmarks validity
4. **"Sync rejected?"** → Verify token, schema version, and rate limit (12 req/60s)
5. **"LocalStorage full?"** → Max 120 crops; older ones discarded; user must export to download full set
6. **"MediaPipe fails?"** → WASM requires CDN; check network, not offline mode
7. **"Participant ID mismatch?"** → Normalize with `normalizeParticipantId("5")` → `"P005"`

---

## Links to Documentation

- [Pilot Research Runbook](docs/pilot-ml-loop.md) – How to run a 30-person pilot with data collection
- [ML Inference Architecture](docs/ml-inference-architecture.md) – On-device vs cloud vision trade-offs
- [Commerce Partnership Playbook](docs/commerce-partnership-playbook.md) – SKU sourcing, partner integrations
- [Supabase Sync Runbook](docs/supabase-sync-runbook.md) – Batch upload protocol, debugging sync issues
- [Mobile Camera QA](docs/mobile-camera-qa.md) – Quality gate thresholds, capture profiles
