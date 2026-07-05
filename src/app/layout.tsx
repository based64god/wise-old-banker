import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Wise Old Banker — OSRS Grand Exchange Analyzer",
  description:
    "Real-time market analysis for Old School RuneScape. Track price trends, identify surging and crashing items, and find high-margin flipping opportunities.",
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <footer className="border-t border-amber-900/40 py-4 text-center text-xs text-stone-500">
          <a
            href="https://github.com/based64god/wise-old-banker"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-amber-300"
          >
            Source on GitHub
          </a>
        </footer>
      </body>
    </html>
  );
}
