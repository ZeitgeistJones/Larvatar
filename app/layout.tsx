import "./globals.css";
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Larvatar — Your larva would hate this",
  description:
    "Your larva would probably hate this website. Stand-ins from larv.ai speech — proxies of proxies, governance theatre, and the rest of the field guide.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
