import type { Metadata, Viewport } from "next";
import horizonMarkDark from "@/assets/horizon-mark-dark.png";
import horizonMarkWhite from "@/assets/horizon-mark-white.png";
import { APP_NAME } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  icons: {
    apple: [{ url: "/pwa/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
    icon: [
      { url: horizonMarkDark.src, type: "image/png", sizes: "96x96" },
      { url: horizonMarkWhite.src, type: "image/png", sizes: "96x96", media: "(prefers-color-scheme: dark)" },
    ],
  },
  description:
    "Jurnal trading XAUUSD, simulasi pemajemukan, penarikan dana dinamis, dan keuangan pribadi.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0B1020",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
