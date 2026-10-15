import type { Metadata } from "next";
import {APP_NAME} from "../lib/branding";
import "./globals.css";
import "./modern.css";
import "./responsive.css";

export const metadata: Metadata = {
  title: APP_NAME,
  applicationName: APP_NAME,
  description: "VETMECH Field Force MR App — customer visits, GPS attendance, agency orders and monthly performance for veterinary field teams.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
