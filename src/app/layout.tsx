import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Montserrat, Playfair_Display, Source_Serif_4 } from "next/font/google";
import { Analytics } from "@/components/analytics";
import { ConfirmHost } from "@/components/confirm";
import { OfflineSupport } from "@/components/offline";
import { compatScript } from "@/lib/compat-script";
import { themeScript } from "@/lib/theme-script";
import { APP_NAME, SITE_DESCRIPTION, SITE_KEYWORDS, SITE_TITLE, SITE_URL } from "@/lib/brand";
import "./globals.css";

// The UI face follows terms.so, which uses ABC Diatype (Dinamo, commercial).
// Geist is the closest open grotesk. With a Diatype licence, drop the woff2
// files in src/app/fonts/ and swap this for:
//   const ui = localFont({ variable: "--font-ui", src: [
//     { path: "./fonts/ABCDiatype-Regular.woff2", weight: "400" },
//     { path: "./fonts/ABCDiatype-Medium.woff2", weight: "500" },
//     { path: "./fonts/ABCDiatype-Bold.woff2", weight: "700" },
//   ] });
// (import localFont from "next/font/local")
const ui = Geist({ variable: "--font-ui", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono-face", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-serif-face", subsets: ["latin"] });
// Projector theme fonts (src/lib/display/theme.ts). Not preloaded: only the
// output screens and the theme editor use them.
const bold = Montserrat({ variable: "--font-bold-face", subsets: ["latin", "latin-ext"], weight: ["700", "800"], preload: false });
const elegant = Playfair_Display({ variable: "--font-elegant-face", subsets: ["latin", "latin-ext"], weight: ["500", "600"], preload: false });

// Search engines and link previews. Pages add their own title (and
// description where it matters); the share image is app/opengraph-image.png.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${APP_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: SITE_KEYWORDS,
  category: "religion",
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_NG",
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The theme script sets data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Tells people on browsers too old for the app what to use instead. */}
        <script dangerouslySetInnerHTML={{ __html: compatScript }} />
      </head>
      <body className={`${ui.variable} ${mono.variable} ${serif.variable} ${bold.variable} ${elegant.variable} antialiased`}>
        {children}
        <ConfirmHost />
        <Analytics />
        <OfflineSupport />
      </body>
    </html>
  );
}
