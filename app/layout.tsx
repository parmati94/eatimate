import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Eatimate", template: "%s · Eatimate" },
  description:
    "Free nutrition calculators for build-your-own restaurant meals — pick your ingredients, get exact calories and macros.",
  applicationName: "Eatimate",
  appleWebApp: { capable: true, title: "Eatimate", statusBarStyle: "default" },
  openGraph: { siteName: "Eatimate", type: "website" },
  twitter: { card: "summary" },
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
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
      </body>
    </html>
  );
}
