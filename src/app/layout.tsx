import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MDTP — Million Dollar Trading Project",
    template: "%s · MDTP",
  },
  description:
    "Jurnal trading XAUUSD, simulator compounding, withdrawal dinamis, dan manajemen keuangan pribadi.",
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
