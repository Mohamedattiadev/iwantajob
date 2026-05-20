import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ChatWidget } from "@/components/chat-widget";
import { OnboardingGate } from "@/components/onboarding-gate";
import { CommandPalette } from "@/components/command-palette";

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
          <OnboardingGate>
            <Nav />
            <main className="flex-1 max-w-6xl w-full mx-auto px-6 sm:px-8 py-12 sm:py-16">{children}</main>
            <ChatWidget />
            <CommandPalette />
          </OnboardingGate>
          <Toaster richColors closeButton position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
