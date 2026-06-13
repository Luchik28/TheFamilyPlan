import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Family Plan",
  description: "A shared weekly calendar — join a plan with an access code.",
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
