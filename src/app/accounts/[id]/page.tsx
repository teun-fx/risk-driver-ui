import type { Metadata } from "next";
import { AccountDetail } from "@/components/account-detail/account-detail";

export const metadata: Metadata = {
  title: "Risk Driver — Account analytics",
  description: "Full analytics for a single trading account.",
};

// Next 16: route params are async.
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AccountDetail id={id} />;
}
