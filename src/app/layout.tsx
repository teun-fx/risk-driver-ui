import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AccountProvider } from "@/components/account-context";
import { AppShell } from "@/components/dashboard/app-shell";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Risk Driver — Dashboard",
  description: "Position risk and trading performance, at a glance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full">
        <AccountProvider>
          <AppShell>{children}</AppShell>
        </AccountProvider>
      </body>
    </html>
  );
}
