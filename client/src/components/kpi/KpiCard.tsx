import type { Kpi, Money, TrendDelta } from "@fintech/shared";
import {
  deltaGlyph,
  describeDelta,
  formatDelta,
  formatMoney,
  formatPercent,
  sentimentColor,
} from "../../lib/format";

export function DeltaBadge({
  delta,
  label,
}: {
  delta: TrendDelta;
  label: string;
}): JSX.Element {
  const color = sentimentColor(delta.sentiment);
  return (
    <span
      className="figure inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
      aria-label={describeDelta(label, delta)}
    >
      <span aria-hidden="true">{deltaGlyph(delta)}</span>
      {formatDelta(delta)}
    </span>
  );
}

function Sparkline({
  values,
  color,
}: {
  values: readonly number[];
  color: string;
}): JSX.Element | null {
  if (values.length < 2) return null;

  const width = 120;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="overflow-visible"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.75}
      />
    </svg>
  );
}

const isMoney = (value: Money | number): value is Money =>
  typeof value === "object" && value !== null && "minorUnits" in value;

export function KpiCard({ kpi }: { kpi: Kpi }): JSX.Element {
  const display = isMoney(kpi.value)
    ? formatMoney(kpi.value, {
        compact: Math.abs(kpi.value.minorUnits) >= 1_000_000,
      })
    : formatPercent(kpi.value);

  const previous = isMoney(kpi.value)
    ? formatMoney({
        minorUnits: Math.round(kpi.delta.previous),
        currency: kpi.value.currency,
      })
    : formatPercent(kpi.delta.previous);

  return (
    <article className="panel px-4 py-3.5 flex flex-col gap-3">
      <header className="flex items-start justify-between gap-2">
        <h3 className="eyebrow">{kpi.label}</h3>
        <DeltaBadge delta={kpi.delta} label={kpi.label} />
      </header>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="figure text-[26px] leading-none font-medium truncate">
            {display}
          </div>
          <div
            className="figure mt-1.5 text-[11px]"
            style={{ color: "var(--graphite)" }}
          >
            prev {previous}
          </div>
        </div>
        <Sparkline
          values={kpi.spark}
          color={sentimentColor(kpi.delta.sentiment)}
        />
      </div>
    </article>
  );
}

export function KpiCardSkeleton(): JSX.Element {
  return (
    <div className="panel px-4 py-3.5 h-[104px] animate-pulse">
      <div className="h-2 w-20 rounded" style={{ background: "var(--rule)" }} />
      <div
        className="mt-5 h-6 w-28 rounded"
        style={{ background: "var(--rule)" }}
      />
    </div>
  );
}
