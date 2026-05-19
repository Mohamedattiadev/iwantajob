import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ChatWidget } from "@/components/chat-widget";
import { OnboardingGate } from "@/components/onboarding-gate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const serif = Instrument_Serif({
  variable: "--font-serif",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IWANTAJOB",
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
      className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <OnboardingGate>
            <Nav />
            <main className="flex-1 max-w-6xl w-full mx-auto px-6 sm:px-8 py-12 sm:py-16">{children}</main>
            <ChatWidget />
          </OnboardingGate>
          <Toaster richColors closeButton position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
