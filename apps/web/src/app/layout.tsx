import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Procedural Asset Studio — Editor · Dark",
  description:
    "Asisten adegan prosedural — tool call terstruktur dieksekusi di engine lokal, scene graph JSON sebagai sumber kebenaran.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
