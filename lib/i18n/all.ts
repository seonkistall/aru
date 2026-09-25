// Registers every dictionary synchronously, for Node-side callers that switch
// language without an await (vitest, scripts). Importing this from app or lib
// code would put all four dictionaries back into the browser's first load and
// undo the split in lib/i18n/core.ts — tests/i18n-lazy-dict.test.ts checks that
// nothing outside tests/ imports it.
import { registerDict } from "./core";
import { EN } from "./en";
import { JA } from "./ja";
import { ZH } from "./zh";
import { AR } from "./ar";

registerDict("en", EN);
registerDict("ja", JA);
registerDict("zh", ZH);
registerDict("ar", AR);
