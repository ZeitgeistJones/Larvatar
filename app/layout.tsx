import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Larvatar — Larva Specimens",
  description: "Personality profiles and avatars for every larva in the CLAWD ecosystem",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
