export type OpenAiVisionUserContent = [
  { type: "text"; text: string },
  { type: "image_url"; image_url: { url: string; detail: "high" } },
];

export function openAiVisionUserContent(text: string, image: string): OpenAiVisionUserContent {
  return [
    { type: "text", text },
    { type: "image_url", image_url: { url: image, detail: "high" } },
  ];
}

