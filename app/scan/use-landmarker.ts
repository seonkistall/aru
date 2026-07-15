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

  const ensureLandmarker = useCallback(async (): Promise<VideoFaceLandmarker | null> => {
    if (landmarkerRef.current) return landmarkerRef.current;

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

    if (disposedRef.current) {
      landmarker.close?.();
      return null;
    }
    landmarkerRef.current = landmarker;
    setDelegate(selected);
    return landmarker;
  }, []);

  const loadLandmarker = useCallback(async () => {
    setGuideState("loading");
    try {
      const landmarker = await ensureLandmarker();
      if (landmarker) setGuideState("ready");
      return landmarker;
    } catch {
      closeCurrent();
      if (!disposedRef.current) setGuideState("failed");
      return null;
    }
  }, [closeCurrent, ensureLandmarker]);

  const reloadLandmarker = useCallback(() => {
    closeCurrent();
    setGuideState("loading");
    setAttempt((current) => current + 1);
  }, [closeCurrent]);

  const forceCpuDelegate = useCallback(() => {
    forceCpuRef.current = true;
    setDelegate("CPU");
    closeCurrent();
  }, [closeCurrent]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      closeCurrent();
    };
  }, [closeCurrent]);

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
