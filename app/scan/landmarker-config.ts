// MediaPipe asset URLs, shared by the main-thread landmarker and the Web Worker
// so both load the exact same WASM fileset and model.
export const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
export const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
