import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Dev only: keep the Next dev-tools badge off our mobile totals bar.
  devIndicators: { position: "bottom-right" },
  // Dev only: let phones/other LAN machines load /_next/* from the dev server.
  allowedDevOrigins: [
    "192.168.1.*",
  ],
};

export default nextConfig;
