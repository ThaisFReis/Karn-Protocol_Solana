import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Karn Protocol Solana Demo",
  description: "Demo dApp for the Karn Protocol on Solana.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
