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
    // suppressHydrationWarning: the theme script below may add the `light`
    // class before React hydrates, which is expected, not a mismatch bug.
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* Apply a saved light theme before first paint to avoid a dark flash.
            Dark is the default and needs no class. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('riskdriver.theme')==='light')document.documentElement.classList.add('light')}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full">
        <AccountProvider>
          <AppShell>{children}</AppShell>
        </AccountProvider>
      </body>
    </html>
  );
}
