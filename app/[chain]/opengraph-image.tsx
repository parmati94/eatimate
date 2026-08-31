import { ImageResponse } from "next/og";
import { getChain, listChains } from "@/lib/data";
import { tileHue } from "@/lib/brand";

// One card per chain, generated at build time. Satori only supports flexbox,
// so every container here is an explicit flex row/column.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  return (await listChains()).map((c) => ({ chain: c.slug }));
}

// Per-chain alt text; the static `alt` export can't vary by param.
export async function generateImageMetadata({
  params,
}: {
  params: { chain: string };
}) {
  const chain = await getChain(params.chain);
  return [
    {
      id: "card",
      size,
      contentType,
      alt: chain
        ? `${chain.name} Nutrition Facts & Calorie Calculator — Eatimate`
        : "Eatimate nutrition calculator",
    },
  ];
}

export default async function Image({
  params,
}: {
  params: Promise<{ chain: string }>;
}) {
  const { chain: slug } = await params;
  const chain = await getChain(slug);
  const hue = tileHue(slug);
  const name = chain?.name ?? "Eatimate";
  const count = chain?.components.length ?? 0;

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
        <div style={{ display: "flex", height: 14, width: 190, background: hue, borderRadius: 7 }} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 82, fontWeight: 700, color: "#16181a", letterSpacing: -2 }}>
            {name}
          </div>
          <div style={{ display: "flex", fontSize: 74, fontWeight: 700, color: hue, letterSpacing: -2, marginTop: 4 }}>
            Nutrition Calculator
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#6b7079", marginTop: 26 }}>
            {count > 0
              ? `Build your order from ${count} ingredients — calories and macros update as you go.`
              : "Build your order — calories and macros update as you go."}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: "#16181a" }}>
            eatimate.app
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#6b7079" }}>
            Every number from {name}&rsquo;s official nutrition data
          </div>
        </div>
      </div>
    ),
    size,
  );
}
