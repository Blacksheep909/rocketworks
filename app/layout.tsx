import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegistration } from "./pwa-registration.tsx";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RocketWorks — Rocket Design & Flight Analysis",
  description: "A clean-room, browser-first workbench for rocket design, staged flight previews, uncertainty analysis, and engineering exports.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/rocketworks-mark.svg",
    apple: "/rocketworks-mark.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#070a0d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}><PwaRegistration />{children}</body></html>;
}
