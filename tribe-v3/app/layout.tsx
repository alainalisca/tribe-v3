import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/LanguageContext";
import PWAInstaller from "@/components/PWAInstaller";

export const metadata: Metadata = {
  title: "Tribe - Find Training Partners",
  description: "Real-time sports training partner matching app",
  manifest: "/manifest.json",
  themeColor: "#bef264",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tribe",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/tribe-logo.svg" />
        <meta name="theme-color" content="#bef264" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Tribe" />
        <link rel="apple-touch-icon" href="/tribe-logo.svg" />
      </head>
      <body className="antialiased">
        <PWAInstaller />
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
