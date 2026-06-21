import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Family Plan",
  description:
    "Plan the family carpool in minutes. Add who's free to drive and where the kids need to be — it figures out who drives whom, pooling rides to save time.",
  applicationName: "The Family Plan",
  openGraph: {
    title: "The Family Plan",
    description:
      "Plan the family carpool in minutes — it figures out who drives whom, pooling rides to save time.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f7cff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
