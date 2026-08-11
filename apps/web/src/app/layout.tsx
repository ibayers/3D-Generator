import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Procedural Asset Studio",
  description: "Local-first 3D asset editor (M1: static renderer)",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
