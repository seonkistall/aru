import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "아루 ARU — 매일의 K뷰티 루틴",
    short_name: "아루",
    description: "아름다움을 매일의 루틴으로 만들어주는 K뷰티 앱.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
