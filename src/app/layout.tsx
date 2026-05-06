import type { Metadata } from "next";
import { DM_Sans, Geist, Geist_Mono } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

import "./globals.css";

const dmSansHeading = DM_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GreenBox 3PL",
  description: "Operations dashboard for GreenBox 3PL — cannabis accessory fulfillment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        dmSansHeading.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
