import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { PageWidthProvider } from "@/components/page-width";
import { SwrProvider } from "@/components/swr-provider";
import { AppShell } from "@/components/app-shell";

const sansFont = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Fraunces: variable serif with personality — opt-soft + 9pt grade axes.
// Replaces Instrument_Serif (whose italic display was reading as generic /
// AI-template). Used sparingly via .font-serif on accent words.
const serif = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal"],
  axes: ["opsz", "SOFT"],
});

export const metadata: Metadata = {
  title: "W/ORK",
  description: "Personal job-market launchpad.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "W/ORK",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

// iPad Safari otherwise renders at the legacy 980px default and Excalidraw's
// canvas collapses to 0 height inside `fixed inset-0` → black screen.
// `viewport-fit=cover` lets the canvas extend under the home-indicator area.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sansFont.variable} ${monoFont.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <PageWidthProvider>
            <SwrProvider>
              <AppShell>{children}</AppShell>
              <Toaster richColors closeButton position="bottom-right" />
            </SwrProvider>
          </PageWidthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
