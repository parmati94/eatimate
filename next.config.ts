import type { NextConfig } from "next";

// Umami Cloud, served from our own origin.
//
// The tracker's own hostname is on EasyPrivacy, so a script loaded from
// cloud.umami.is is blocked for anyone running uBlock with default lists --
// and a blocked beacon is not a small undercount, it is a silently biased
// sample. Proxied through /stats/* there is no third-party hostname to match
// on: the browser sees our domain serving our path. The tracker is told to
// post here too (data-host-url in components/Analytics.tsx), which is why the
// send route has to be rewritten alongside the script.
//
// /stats rather than /api: the app has no route handlers today, but /api is
// where they would go, and a rewrite silently shadowing a future one is the
// kind of collision that is found in production or not at all.
//
// Two different hosts, which the tracker itself does not make obvious: the
// script is served from cloud.umami.is, but collection defaults to
// gateway.umami.is (`(hostUrl || "https://gateway.umami.is") + "/api/send"` in
// script.js). Pointing the send route at cloud.umami.is looks right and drops
// every event on the floor.
const UMAMI_SCRIPT = "https://cloud.umami.is";
const UMAMI_GATEWAY = "https://gateway.umami.is";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      { source: "/stats/script.js", destination: `${UMAMI_SCRIPT}/script.js` },
      { source: "/stats/api/send", destination: `${UMAMI_GATEWAY}/api/send` },
    ];
  },
  // Dev only: keep the Next dev-tools badge off our mobile totals bar.
  devIndicators: { position: "bottom-right" },
  // Dev only: let phones/other LAN machines load /_next/* from the dev server.
  allowedDevOrigins: ["192.168.1.*", "10.*", "172.16.*"],
};

export default nextConfig;
