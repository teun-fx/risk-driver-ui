"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { demoAccounts, type Account, type HistTrade } from "@/lib/data";

const STORAGE_KEY = "riskdriver.accounts.v1";
const SELECTED_KEY = "riskdriver.selected.v1";

// localStorage holds JSON, so trade dates round-trip as ISO strings.
type StoredTrade = Omit<HistTrade, "date"> & { date: string };
type StoredAccount = Omit<Account, "trades"> & { trades?: StoredTrade[] };

function serialize(a: Account): StoredAccount {
  return {
    ...a,
    trades: a.trades?.map((t) => ({ ...t, date: t.date.toISOString() })),
  };
}
function revive(s: StoredAccount): Account {
  return {
    ...s,
    trades: s.trades?.map((t) => ({ ...t, date: new Date(t.date) })),
  };
}

type Ctx = {
  /** Demo accounts followed by imported ones. */
  accounts: Account[];
  imported: Account[];
  account: Account;
  setAccount: (a: Account) => void;
  addAccount: (a: Account) => void;
  removeAccount: (id: string) => void;
};

const AccountContext = createContext<Ctx | null>(null);

/**
 * The selected account scopes every page and survives navigation. Imported
 * accounts persist in localStorage; the two demo accounts are always present.
 */
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [imported, setImported] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string>(demoAccounts[0].id);

  // Load persisted imports AND the last selection after mount. This must be an
  // effect, not a lazy initializer: localStorage doesn't exist during SSR, and
  // reading it there would both throw and cause a hydration mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only hydration of persisted state
        setImported((JSON.parse(raw) as StoredAccount[]).map(revive));
      }
      const sel = localStorage.getItem(SELECTED_KEY);
      if (sel) setSelectedId(sel);
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const select = (id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(SELECTED_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const persist = (list: Account[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.map(serialize)));
    } catch {
      /* storage full or unavailable — the account stays for this session */
    }
  };

  const accounts = [...demoAccounts, ...imported];
  const account = accounts.find((a) => a.id === selectedId) ?? demoAccounts[0];

  const addAccount = (a: Account) => {
    setImported((prev) => {
      const next = [...prev, a];
      persist(next);
      return next;
    });
    select(a.id);
  };

  const removeAccount = (id: string) => {
    setImported((prev) => {
      const next = prev.filter((x) => x.id !== id);
      persist(next);
      return next;
    });
    if (selectedId === id) select(demoAccounts[0].id);
  };

  return (
    <AccountContext.Provider
      value={{
        accounts,
        imported,
        account,
        setAccount: (a) => select(a.id),
        addAccount,
        removeAccount,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside AccountProvider");
  return ctx;
}
