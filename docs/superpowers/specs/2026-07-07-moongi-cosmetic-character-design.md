# Moongi Cosmetic Character Design

Date: 2026-07-07
Repo: `seonkistall/aru`

## Goal

Apply the Moongi/Xiaohei-inspired character language across ARU while keeping the app suitable for a cosmetic product. The style should be minimal, cute, clean, and friendly. It should not feel bizarre, grotesque, editorial, or like an article illustration system.

## Source Direction

The referenced `moongi-xiaohei-illustrations` repository is a style/skill repository, not a finished asset pack. ARU will not copy image files from it. Instead, ARU will adapt the useful character principles:

- simple black body
- white dot eyes
- hand-drawn but clean silhouette
- small functional props
- plenty of white space
- sparse accent colors

ARU will intentionally avoid the source repo's stranger editorial direction:

- no absurd machines
- no grotesque or uncanny poses
- no complex concept-diagram compositions
- no dense handwritten annotations

## Visual Design

The ARU character becomes a small cosmetic helper:

- rounded black bean-like body
- soft white eyes
- tiny smile or calm neutral mouth
- short legs and simple arms
- subtle blush accents
- props tied to the app: magnifier, skincare bottle, routine card, sparkle/check

The character should feel like a quiet K-beauty assistant, not a mascot overpowering the product.

## Implementation Scope

Use code-based SVG assets so the character stays crisp and lightweight.

Primary implementation points:

- `app/components/sketch.tsx`: update `Xiaohei` SVG poses and comments to the Moongi cosmetic style.
- Existing character usage in `/scan`, `/report`, `/care`, and `/checkin` should keep working through the same `Xiaohei` API.
- App icon assets should be regenerated from the same SVG language:
  - `app/icon.svg`
  - `app/apple-icon.png`
  - favicon path if the app currently uses a static favicon
- Keep `SketchDefs` and `SketchBox` unless a change is directly needed for the new style.

Out of scope:

- no layout redesign
- no new generated PNG illustration set for page bodies
- no product recommendation or ML logic changes
- no copywriting overhaul beyond character/icon labels if required

## Technical Constraints

- Keep SVG inline for reusable in-app character poses.
- Preserve the existing `Xiaohei({ size, pose, bob })` API unless a compiler issue forces a narrow change.
- Keep styles compatible with the existing CSS variables: `--ink`, `--plum`, `--orange`, and related tokens.
- Keep app icon generation deterministic and committed as static files.
- Before editing Next.js app/icon behavior, check available Next.js docs. If local `node_modules/next/dist/docs` is missing, note that and limit changes to existing file patterns.

## QA

Minimum checks:

- TypeScript/ESLint compile path still accepts the updated component.
- Existing pages using `Xiaohei` render without prop changes.
- App icon files exist and are valid image assets.
- Run the repo's normal verification command if dependencies are available: `npm run smoke`.

If dependencies are unavailable, run the strongest available static checks and report the gap.

