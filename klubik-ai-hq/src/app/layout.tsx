import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Klubik AI HQ",
  description: "Le quartier général des agents IA de Klubik.",
  applicationName: "Klubik AI HQ",
  appleWebApp: { capable: true, title: "Klubik HQ", statusBarStyle: "default" },
  icons: { icon: "/icons/favicon-32.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F8F9FC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
