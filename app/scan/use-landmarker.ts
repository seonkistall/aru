"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createVideoLandmarker } from "./create-landmarker";
import type { GuideState } from "./capture-analysis";
import type { Landmark } from "./types";

export type VideoFaceLandmarker = {
  detectForVideo: (source: HTMLVideoElement | HTMLCanvasElement, timestampMs: number) => { faceLandmarks?: Landmark[][] };
  close?: () => void;
};

export function useLandmarker() {
  const landmarkerRef = useRef<VideoFaceLandmarker | null>(null);
  // The creation in flight, handed to every caller that asks while it runs. Without it,
  // hiding /scan during the first (slow) load and tapping 카메라 다시 켜기 started a second
  // creation, and the one that lost was never closed.
  const pendingRef = useRef<Promise<VideoFaceLandmarker | null> | null>(null);
  // Bumped when the landmarker in hand stops being the one to use: a reload, the switch to
  // CPU, unmount. A creation or a load from an older generation is stale — it closes what
  // it makes instead of installing it, and its failure is not the current guide's failure.
  const generationRef = useRef(0);
  const forceCpuRef = useRef(false);
  const disposedRef = useRef(false);
  const [delegate, setDelegate] = useState<"GPU" | "CPU">("GPU");
  const [guideState, setGuideState] = useState<GuideState>("loading");
  const [attempt, setAttempt] = useState(0);

  const closeCurrent = useCallback(() => {
    const current = landmarkerRef.current;
    landmarkerRef.current = null;
    current?.close?.();
  }, []);

  const supersede = useCallback(() => {
    generationRef.current += 1;
    pendingRef.current = null;
    closeCurrent();
  }, [closeCurrent]);

  const ensureLandmarker = useCallback(async (): Promise<VideoFaceLandmarker | null> => {
    if (landmarkerRef.current) return landmarkerRef.current;
    if (pendingRef.current) return pendingRef.current;

    const generation = generationRef.current;
    const pending = (async () => {
      let landmarker: VideoFaceLandmarker;
      let selected: "GPU" | "CPU";
      if (forceCpuRef.current) {
        selected = "CPU";
        landmarker = await createVideoLandmarker("CPU");
      } else {
        try {
          selected = "GPU";
          landmarker = await createVideoLandmarker("GPU");
        } catch {
          selected = "CPU";
          landmarker = await createVideoLandmarker("CPU");
        }
      }

      if (disposedRef.current || generation !== generationRef.current) {
        landmarker.close?.();
        return null;
      }
      landmarkerRef.current = landmarker;
      setDelegate(selected);
      return landmarker;
    })();
    pendingRef.current = pending;
    try {
      return await pending;
    } finally {
      if (pendingRef.current === pending) pendingRef.current = null;
    }
  }, []);

  const loadLandmarker = useCallback(async () => {
    const generation = generationRef.current;
    setGuideState("loading");
    try {
      const landmarker = await ensureLandmarker();
      if (landmarker) setGuideState("ready");
      return landmarker;
    } catch {
      // A load that was superseded while it ran must not close the landmarker that
      // replaced it, or put the failed overlay over a guide that loaded.
      if (generation !== generationRef.current) return null;
      closeCurrent();
      if (!disposedRef.current) setGuideState("failed");
      return null;
    }
  }, [closeCurrent, ensureLandmarker]);

  const reloadLandmarker = useCallback(() => {
    supersede();
    setGuideState("loading");
    setAttempt((current) => current + 1);
  }, [supersede]);

  const forceCpuDelegate = useCallback(() => {
    forceCpuRef.current = true;
    setDelegate("CPU");
    supersede();
  }, [supersede]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      supersede();
    };
  }, [supersede]);

  return {
    landmarkerRef,
    delegate,
    guideState,
    attempt,
    ensureLandmarker,
    loadLandmarker,
    reloadLandmarker,
    forceCpuDelegate,
  };
}
