import type { Metadata } from "next";
import { Analytics } from "@/components/analytics/analytics";

export const metadata: Metadata = {
  title: "Risk Driver — Analytics",
  description: "Equity, drawdown and trade distribution analysis.",
};

export default function AnalyticsPage() {
  return <Analytics />;
}
