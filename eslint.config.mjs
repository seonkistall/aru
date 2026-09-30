import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // The e2e commerce switch-on server builds into its own dist dir alongside `.next`
    // (tests/e2e/support/commerce-switch-on.ts), and `.next/**` above does not cover it.
    // Unignored it is the same defect the `test-results/**` note below describes: `npm run
    // smoke` runs `lint` FIRST, so a build output nobody wrote turns the gate red at step 1.
    ".next-switch-on/**",
    "out/**",
    "build/**",
    "public/vendor/**",
    "next-env.d.ts",
    // Playwright's failure artifacts, which are gitignored (.gitignore) but were not
    // ignored here. `trace: "retain-on-failure"` writes the app's own compiled JS into
    // `test-results/**/traces/resources/`, so one failing e2e run left 6366 files that
    // `npm run lint` then walked: `0 errors, 2 warnings` on a fresh clone became
    // `215 errors, 4020 warnings`. Because `npm run smoke` runs `lint` FIRST, that made
    // the gate red at step 1 over a previous run's leftovers, pointing every reader at
    // code that is not the app's. A fresh clone has neither directory, which is why this
    // never showed up in CI.
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
