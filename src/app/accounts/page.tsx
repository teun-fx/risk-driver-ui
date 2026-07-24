import type { Metadata } from "next";
import { Accounts } from "@/components/accounts/accounts";

export const metadata: Metadata = {
  title: "Risk Driver — Accounts",
  description: "Connect and manage your trading accounts.",
};

export default function AccountsPage() {
  return <Accounts />;
}
