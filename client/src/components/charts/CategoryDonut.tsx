import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";
import type { CategorySlice, CurrencyCode } from "@fintech/shared";
import { categoryColor } from "./chart-theme";
import { DeltaBadge } from "../kpi/KpiCard";
import { formatMoney, formatPercent } from "../../lib/format";

interface CategoryDonutProps {
  readonly slices: readonly CategorySlice[];
  readonly currency: CurrencyCode;
}

interface ActiveShapeProps {
  readonly cx: number;
  readonly cy: number;
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly fill: string;
}

function ActiveSlice(input: unknown): JSX.Element {
  const props = input as ActiveShapeProps;
  return (
    <Sector
      cx={props.cx}
      cy={props.cy}
      innerRadius={props.innerRadius}
      outerRadius={props.outerRadius + 4}
      startAngle={props.startAngle}
      endAngle={props.endAngle}
      fill={props.fill}
    />
  );
}

export function CategoryDonut({
  slices,
  currency,
}: CategoryDonutProps): JSX.Element {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const total = slices.reduce((acc, slice) => acc + slice.total.minorUnits, 0);
  const active = activeIndex === null ? null : slices[activeIndex];

  const data = slices.map((slice) => ({
    name: slice.category,
    value: slice.total.minorUnits / 100,
  }));

  if (slices.length === 0) {
    return (
      <section className="panel p-4 flex flex-col">
        <h2 className="display text-[15px] font-semibold">Spend by category</h2>
        <p className="mt-6 text-[13px]" style={{ color: "var(--graphite)" }}>
          No settled expenses in this range. Import a statement or widen the
          date range to see a breakdown.
        </p>
      </section>
    );
  }

  return (
    <section className="panel p-4" aria-label="Spending by category">
      <header className="mb-2">
        <h2 className="display text-[15px] font-semibold">Spend by category</h2>
        <p className="eyebrow mt-1">{slices.length} active categories</p>
      </header>

      <div className="relative h-[196px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={86}
              paddingAngle={1.5}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              {...(activeIndex !== null ? { activeIndex } : {})}
              activeShape={ActiveSlice}
              onMouseEnter={(_, index: number) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={categoryColor(index)}
                  opacity={
                    activeIndex === null || activeIndex === index ? 1 : 0.35
                  }
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          aria-live="polite"
        >
          <span className="eyebrow">
            {active ? active.category : "total spend"}
          </span>
          <span className="figure text-[20px] mt-1">
            {active
              ? formatMoney(active.total, { compact: true })
              : formatMoney({ minorUnits: total, currency }, { compact: true })}
          </span>
          <span
            className="figure text-[11px] mt-0.5"
            style={{ color: "var(--graphite)" }}
          >
            {active
              ? formatPercent(active.share * 100)
              : `${slices.length} categories`}
          </span>
        </div>
      </div>

      <ul className="mt-3 space-y-px">
        {slices.slice(0, 6).map((slice, index) => (
          <li key={slice.category}>
            <button
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded text-left"
              style={{
                background:
                  activeIndex === index
                    ? "var(--surface-raised)"
                    : "transparent",
              }}
            >
              <span
                className="h-2 w-2 rounded-sm shrink-0"
                style={{ background: categoryColor(index) }}
                aria-hidden="true"
              />
              <span
                className="text-[12.5px] capitalize truncate"
                style={{ color: "var(--parchment)" }}
              >
                {slice.category}
              </span>
              <span
                className="figure text-[11px] ml-auto"
                style={{ color: "var(--graphite)" }}
              >
                {formatPercent(slice.share * 100, 0)}
              </span>
              <span className="figure text-[12px] w-20 text-right">
                {formatMoney(slice.total, { compact: true })}
              </span>
              <DeltaBadge delta={slice.delta} label={slice.category} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
