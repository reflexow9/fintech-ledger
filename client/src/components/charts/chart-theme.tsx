import type { CurrencyCode } from '@fintech/shared';
import { formatMajorNumber, formatDate } from '../../lib/format';

export const CHART = {
  inflow: 'var(--inflow)',
  outflow: 'var(--outflow)',
  forecast: 'var(--gold)',
  grid: 'var(--rule)',
  axis: 'var(--graphite)',
  surface: 'var(--surface)',
} as const;

export const CATEGORY_RAMP: readonly string[] = [
  '#4C7DF0',
  '#5FA8D3',
  '#4FBFA8',
  '#8AC28A',
  '#C8A44D',
  '#D98C5F',
  '#C4657A',
  '#8E6FB0',
  '#6C7A8C',
];

export const categoryColor = (index: number): string =>
  CATEGORY_RAMP[index % CATEGORY_RAMP.length] ?? CHART.axis;

export const axisProps = {
  stroke: CHART.axis,
  tickLine: false,
  axisLine: false,
  tick: { fill: CHART.axis, fontSize: 10.5, fontFamily: 'IBM Plex Mono, monospace' },
} as const;

export const currencyTick = (currency: CurrencyCode) => (value: number) =>
  formatMajorNumber(value, currency, true);

export const dateTick = (value: string): string => formatDate(value);

export interface TooltipEntry {
  readonly name?: string | number;
  readonly value?: number;
  readonly color?: string;
  readonly dataKey?: string | number;
}

export interface ChartTooltipProps {
  readonly active?: boolean;
  readonly label?: string | number;
  readonly payload?: readonly TooltipEntry[];
  readonly currency: CurrencyCode;
  readonly hiddenKeys?: readonly string[];
}

export function ChartTooltip({
  active,
  label,
  payload,
  currency,
  hiddenKeys = [],
}: ChartTooltipProps): JSX.Element | null {
  if (!active || !payload?.length) return null;

  const rows = payload.filter((entry) => !hiddenKeys.includes(String(entry.dataKey)));
  if (rows.length === 0) return null;

  return (
    <div
      className="panel px-3 py-2 shadow-lg"
      style={{ background: 'var(--surface-raised)' }}
      role="tooltip"
    >
      <div className="eyebrow mb-1.5">{typeof label === 'string' ? formatDate(label, 'long') : label}</div>
      <ul className="space-y-1">
        {rows.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-3 text-[12px]">
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ background: entry.color ?? CHART.axis }}
              aria-hidden="true"
            />
            <span style={{ color: 'var(--graphite)' }}>{entry.name}</span>
            <span className="figure ml-auto" style={{ color: 'var(--parchment)' }}>
              {formatMajorNumber(entry.value ?? 0, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
