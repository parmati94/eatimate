import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Dev only: let phones/other LAN machines load /_next/* from the dev server.
  allowedDevOrigins: [
    "192.168.1.*",
  ],
};

export default nextConfig;
