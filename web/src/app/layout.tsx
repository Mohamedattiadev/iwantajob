import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ChatWidget } from "@/components/chat-widget";
import { OnboardingGate } from "@/components/onboarding-gate";
import { CommandPalette } from "@/components/command-palette";
import { AmbientBackground } from "@/components/ambient-bg";
import { PageWidthProvider } from "@/components/page-width";
import { TodoDrawer } from "@/components/todo-drawer";

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
            <AmbientBackground />
            <OnboardingGate>
              <Nav />
              <main className="app-main flex-1 w-full mx-auto flex flex-col min-h-0">{children}</main>
              <ChatWidget />
              <TodoDrawer />
              <CommandPalette />
            </OnboardingGate>
            <Toaster richColors closeButton position="bottom-right" />
          </PageWidthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
