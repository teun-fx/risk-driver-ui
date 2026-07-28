"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { GlassFilter } from "@/components/ui/button";
import { useAccount } from "@/components/account-context";

/** Chrome shared by every page: rail, header, and the content column. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { account, setAccount } = useAccount();

  return (
    <div className="flex min-h-dvh">
      {/* SVG displacement filter shared by every glass button. */}
      <GlassFilter />
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header account={account} onAccountChange={setAccount} />

        <main className="flex-1 px-6 py-6 lg:px-8">
          <div className="mx-auto max-w-[1440px] space-y-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
