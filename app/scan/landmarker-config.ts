import { MEDIAPIPE_VERSION } from "./mediapipe-version";

// MediaPipe asset URLs, shared by the main-thread landmarker and the Web Worker
// so both load the exact same WASM fileset and model.
//
// The WASM path carries the installed package version because the bundled JS API and
// this runtime have no version handshake between them — the bundle calls Emscripten
// exports off the module it gets and finds out at that moment. Both the directory and
// this URL are written from one read of the package's own `package.json` by
// `scripts/copy-mediapipe-assets.mjs` in one pass, so no install can separate them —
// only a hand edit can, and the test named below fails on it. An upgrade moves the URL,
// which makes a warm HTTP or service-worker cache miss rather than answer a new bundle
// with the runtime it already holds. `tests/mediapipe-assets.test.ts` pins the
// agreement between this path, the generated version and what is on disk.
export const WASM = `/vendor/mediapipe/${MEDIAPIPE_VERSION}/wasm`;
// Not versioned: the face model is not shipped by the package and does not move with
// it. It is a single URL whose bytes only change when someone replaces the file, and
// the service worker's revalidation (cycle 44) is what picks that up.
export const MODEL = "/vendor/mediapipe/face_landmarker.task";
