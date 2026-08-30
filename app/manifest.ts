import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Eatimate",
    short_name: "Eatimate",
    description:
      "Free nutrition calculators for build-your-own restaurant meals.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f8f7",
    theme_color: "#0d9488",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
