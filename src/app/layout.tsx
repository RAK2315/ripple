import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell/shell";

const serif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const sans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

const SITE = "https://ripple-psi-gold.vercel.app";
const TITLE = "RIPPLE: see where your money is going, and where it ends up";
const DESCRIPTION =
  "A money twin for Indian users. Paste bank SMS, it learns rules from your corrections, branches your future into scenarios, and shows what ignored advice has cost you. No rupee figure is ever produced by a language model.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "RIPPLE", template: "%s · RIPPLE" },
  description: DESCRIPTION,
  applicationName: "RIPPLE",
  openGraph: { type: "website", url: SITE, siteName: "RIPPLE", title: TITLE, description: DESCRIPTION, locale: "en_IN" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport = { themeColor: "#F4F2ED" };

// set the persisted theme before first paint (no flash)
const THEME_SCRIPT = `try{var t=localStorage.getItem("ripple-theme");if(t==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
