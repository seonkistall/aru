import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Clear Turbopack's persistent dev cache before an e2e run.
 *
 * Why this is a script and not two lines at the top of the Playwright configs: a config
 * module is imported by the runner AND again by every worker process, so clearing there
 * deleted the cache from under the dev server the runner had already started. Turbopack
 * then logged `Persisting failed: Another write batch or compaction is already active`
 * and `guide-ltr-in-rtl-chrome.regression-34` went from `8 passed` to `8 failed` on a
 * clean tree. As the first link of `webServer.command` it runs exactly once, before the
 * server exists, which is the only safe moment.
 *
 * `.next/dev` only, never the parent. `npm run smoke` runs the e2e suite BEFORE
 * `next build`, and the `next start` at the end of the same run serves the production
 * output from `.next` — removing the parent would delete a build this process did not make.
 */
const devCache = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), ".next", "dev");
rmSync(devCache, { recursive: true, force: true, maxRetries: 3 });
