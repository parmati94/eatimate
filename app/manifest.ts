import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "mealmath",
    short_name: "mealmath",
    description:
      "Restaurant nutrition calculators for chains that only publish a PDF.",
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
