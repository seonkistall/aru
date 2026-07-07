import { describe, expect, test } from "vitest";
import { openAiVisionUserContent } from "@/lib/vision-payload";

describe("vision provider payloads", () => {
  test("uses high-detail OpenAI image analysis for upgraded camera crops", () => {
    expect(openAiVisionUserContent("instructions", "data:image/jpeg;base64,abc")).toEqual([
      { type: "text", text: "instructions" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,abc", detail: "high" } },
    ]);
  });
});

