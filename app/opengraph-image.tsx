import { ImageResponse } from "next/og";
import { listChains } from "@/lib/data";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Eatimate — free nutrition calculators for build-your-own restaurant meals";

export default async function Image() {
  const chains = await listChains();
  const total = chains.reduce((n, c) => n + c.components.length, 0);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f7f7f5",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", height: 14, width: 190, background: "#0d9488", borderRadius: 7 }} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 90, fontWeight: 700, color: "#16181a", letterSpacing: -3 }}>
            Build the meal.
          </div>
          <div style={{ display: "flex", fontSize: 90, fontWeight: 700, color: "#0f766e", letterSpacing: -3 }}>
            Know the numbers.
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#6b7079", marginTop: 28 }}>
            Free nutrition calculators for build-your-own restaurant meals.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: "#16181a" }}>
            eatimate.app
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#6b7079" }}>
            {chains.length} restaurants · {total.toLocaleString("en-US")} ingredients
          </div>
        </div>
      </div>
    ),
    size,
  );
}
