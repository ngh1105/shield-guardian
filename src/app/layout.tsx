import type { Metadata } from "next";

import "./globals.css";
import { WalletProvider } from "@/features/wallet/wallet-context";
import {
  PROJECT_DESCRIPTION,
  PROJECT_NAME,
} from "@/lib/project-metadata";

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description: PROJECT_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
