import type { Metadata } from "next";
import { ToastProvider } from "@/components/Toast";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import "./globals.css";

const title = "RollInit - D&D Initiative Tracker & Dice Roller";
const description =
  "Real-time D&D initiative tracker and dice roller. DMs create sessions, players join with a code. Track combat, roll dice, and manage encounters.";

export const metadata: Metadata = {
  metadataBase: new URL("https://rollinit.app"),
  title,
  description,
  keywords: [
    "D&D",
    "initiative tracker",
    "dice roller",
    "Dungeons and Dragons",
    "DnD",
    "combat tracker",
    "tabletop RPG",
    "TTRPG",
    "dungeon master tools",
    "DM tools",
  ],
  icons: {
    icon: "/favicon.ico",
  },
  manifest: "/manifest.json",
  openGraph: {
    title,
    description,
    url: "https://rollinit.app",
    siteName: "RollInit",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <GoogleAnalytics />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
