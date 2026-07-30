import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress, SegmentMeter } from "@/components/ui/progress";
import { riskFor, statsFor, type Account } from "@/lib/data";

export function RiskPanel({ account }: { account: Account }) {
  // Live risk (open exposure, margin) isn't in a closed-trade statement.
  // The one thing we do know is the risk-per-trade the user configured.
  if (account.source === "html") {
    return (
      <Card className="flex min-w-0 flex-col">
        <CardHeader>
          <CardTitle>Risk exposure</CardTitle>
          <span className="text-label text-ink-muted">Imported</span>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-center">
          {account.riskPerTrade != null && (
            <div className="flex items-baseline justify-between border-b border-line pb-4">
              <span className="text-label text-ink-secondary">
                Risk per trade
              </span>
              <span className="text-metric text-ink">
                {account.riskPerTrade}%
              </span>
            </div>
          )}
          <p className="pt-4 text-label text-ink-muted">
            Live exposure and margin aren&apos;t in a closed-trade statement.
            Connect this account live to track open risk.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { used, metrics } = riskFor(account);
  const level = used > 70 ? "High" : used > 45 ? "Elevated" : "Normal";
  // The chip is the only place colour means anything here — the meters below
  // are plain ink so the card reads as one object, not a traffic light.
  const tone = used > 70 ? "loss" : used > 45 ? "warn" : "profit";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk exposure</CardTitle>
        <Badge tone={tone} dot>
          {level}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-5">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-label text-ink-secondary">Daily risk budget</span>
            <span className="text-label tnum font-medium text-ink">{used}%</span>
          </div>
          <div className="mt-2.5">
            <SegmentMeter value={used} tone="ink" label="Daily risk budget" />
          </div>
        </div>

        <div className="space-y-4 border-t border-line pt-4">
          {metrics.map((m) => (
            <div key={m.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-label text-ink-secondary">{m.label}</span>
                <span className="text-label tnum font-medium text-ink">{m.value}%</span>
              </div>
              <Progress value={m.value} tone="ink" className="mt-2" label={m.label} />
              <p className="mt-1.5 text-[11.5px] text-ink-muted">{m.detail}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsGrid({ account }: { account: Account }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {statsFor(account).map((s) => (
            <div key={s.label}>
              <dt className="text-eyebrow text-ink-muted">{s.label}</dt>
              <dd className="mt-1.5 text-[17px] leading-6 font-semibold tnum text-ink">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
