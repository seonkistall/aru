import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("node_modules/@mediapipe/tasks-vision/wasm");
const target = resolve("public/vendor/mediapipe/wasm");
if (!existsSync(source)) throw new Error("Install @mediapipe/tasks-vision before copying assets.");
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log("MediaPipe WASM assets copied.");
