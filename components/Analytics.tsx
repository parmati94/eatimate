"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { pageview } from "@/lib/analytics";

/**
 * Umami Cloud, loaded first-party and driven by hand.
 *
 * data-auto-track is OFF, and that single attribute is doing two jobs. Reading
 * script.js: `M && !U() && z()` is the whole of the tracker's automatic
 * behaviour, and z() both sends the first pageview AND wraps history.pushState
 * and history.replaceState. The builder rewrites the URL on a debounce as the
 * meal changes, so left automatic, one person building one meal reports as a
 * dozen pageviews at a dozen distinct URLs -- the same failure the Cloudflare
 * beacon has spelled out beside it in layout.tsx, and the reason that URL sync
 * is debounced at all. With it off, nothing is counted that we did not count
 * on purpose, and a pageview means a navigation again.
 *
 * window.umami is assigned regardless of that flag, so events still work; the
 * cost is that the first pageview is now ours to send, hence onLoad below.
 *
 * The website id arrives as a prop, read from the environment by the server
 * layout, rather than from NEXT_PUBLIC_*: those are inlined at build time, so
 * the id would be baked into the image and changing it would mean a rebuild
 * and a redeploy. This is the same shape CF_BEACON_TOKEN already uses, and it
 * keeps development out of the numbers by simply not setting the variable.
 */
export default function Analytics({ id }: { id: string }) {
  const pathname = usePathname();
  // Until the script has run there is no window.umami to call, and a pageview
  // sent into the void is a lost landing rather than a late one.
  const ready = useRef(false);

  useEffect(() => {
    if (ready.current) pageview(pathname);
  }, [pathname]);

  return (
    <Script
      src="/stats/script.js"
      strategy="afterInteractive"
      data-website-id={id}
      // Relative on purpose. The tracker builds its endpoint by concatenation
      // -- `(hostUrl || "https://gateway.umami.is") + "/api/send"` -- so this
      // becomes /stats/api/send on whatever origin is serving the page, which
      // keeps localhost and production both talking to themselves. Without it
      // the beacon goes straight to gateway.umami.is and the proxy is pointless.
      data-host-url="/stats"
      data-auto-track="false"
      // Belt and braces against the meal leaking into the numbers: pageview()
      // already overrides the URL, and this makes the tracker's own default
      // drop the query string too, so no path through the code can send ?m=.
      data-exclude-search="true"
      // Honour the browser's Do Not Track signal. Costs us a slice of the
      // numbers; it is the setting a site that says what ours says should have.
      data-do-not-track="true"
      onLoad={() => {
        ready.current = true;
        // Read the location now rather than closing over the pathname from
        // first render: if someone navigated while the script was still in
        // flight, that render's value is already stale.
        pageview(window.location.pathname);
      }}
    />
  );
}
