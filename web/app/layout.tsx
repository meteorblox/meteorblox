
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./onboarding.css";
import { AppProviders } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.slvrblox.com"),
  title: "SLVRBLOX — Mine the Grid. Claim the Load.",
  description: "Deploy SUI across the live mining grid, compete for rewards, discover Motherload rounds, and refine DSLVR on Sui.",
  icons: {
    icon: "/brand/dslvr-coin.png",
    shortcut: "/brand/dslvr-coin.png",
    apple: "/brand/dslvr-coin.png",
  },
  openGraph: {
    title: "SLVRBLOX — Mine the Grid. Claim the Load.",
    description: "A live mining game and community ecosystem built on Sui.",
    url: "https://www.slvrblox.com",
    siteName: "SLVRBLOX",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SLVRBLOX — Mine the Grid. Claim the Load." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SLVRBLOX — Mine the Grid. Claim the Load.",
    description: "A live mining game and community ecosystem built on Sui.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
