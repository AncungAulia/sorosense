import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SoroSense — Stablecoin yield, guarded around the clock",
  description:
    "Non-custodial stablecoin yield on Stellar. Deposit what you already hold; an AI agent finds the safest-highest yield while a Sentinel guards your funds around the clock.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col overflow-x-hidden bg-paper font-body text-ink">
        {children}
      </body>
    </html>
  );
}
