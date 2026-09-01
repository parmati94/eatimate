import type { Metadata, Viewport } from "next";
import { Archivo, Geist } from "next/font/google";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Geist carries running text and controls. Archivo carries every heading and
// every figure: it is a squared grotesque with real weight contrast, which is
// the register the FDA panel already sets on this site. Geist Mono used to be
// loaded here for a single textarea -- a whole font download for one element --
// so the mono role now falls back to the platform stack.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  // 800 is the calorie figure and the h1; 500-700 covers headings and numerals.
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Eatimate", template: "%s · Eatimate" },
  description:
    "Free nutrition calculators for build-your-own restaurant meals — pick your ingredients, get exact calories and macros.",
  applicationName: "Eatimate",
  appleWebApp: { capable: true, title: "Eatimate", statusBarStyle: "default" },
  openGraph: { siteName: "Eatimate", type: "website", url: "/" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f11" },
  ],
  colorScheme: "light dark",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const beaconToken = process.env.CF_BEACON_TOKEN;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${archivo.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-bg text-fg">
        {/* Apply a saved theme before first paint; default is the OS setting. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("eatimate.theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
          }}
        />
        <Header />
        {children}
        <SiteFooter />
        {/*
          Cloudflare Web Analytics, embedded manually so we can set spa:false.
          The beacon patches the History API, and the meal builder rewrites the
          URL via replaceState, so SPA mode counted every ingredient tap as a
          pageview. Only renders when CF_BEACON_TOKEN is set -- keep it unset
          until "Automatic setup" is OFF in the dashboard, or both beacons load
          and every hit is counted twice.
        */}
        {beaconToken ? (
          /* type="module" is deferred by definition, so this never blocks
             parsing; the rule does not read the type attribute. */
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script
            type="module"
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: beaconToken, spa: false })}
          />
        ) : null}
      </body>
    </html>
  );
}
