import type { CurrencyCode, Money, TrendDelta } from "@fintech/shared";

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function formatter(
  currency: CurrencyCode,
  compact: boolean,
): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  const cached = currencyFormatters.get(key);
  if (cached) return cached;

  const created = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    ...(compact
      ? { notation: "compact", maximumFractionDigits: 1 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  });
  currencyFormatters.set(key, created);
  return created;
}

export function formatMoney(
  value: Money,
  options: { compact?: boolean } = {},
): string {
  const major = value.minorUnits / 100;
  return formatter(value.currency, options.compact ?? false).format(major);
}

export const formatMajorNumber = (
  major: number,
  currency: CurrencyCode,
  compact = false,
): string => formatter(currency, compact).format(major);

export const formatPercent = (value: number, digits = 1): string =>
  `${value.toFixed(digits)}%`;

export const deltaGlyph = (delta: TrendDelta): string =>
  delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "●";

export function formatDelta(delta: TrendDelta): string {
  if (delta.percentChange === null) return "New";
  const sign = delta.percentChange > 0 ? "+" : "";
  return `${sign}${delta.percentChange.toFixed(1)}%`;
}

export const sentimentColor = (sentiment: TrendDelta["sentiment"]): string =>
  sentiment === "positive"
    ? "var(--inflow)"
    : sentiment === "negative"
      ? "var(--outflow)"
      : "var(--graphite)";

export const formatDate = (
  iso: string,
  style: "short" | "long" = "short",
): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    ...(style === "long" ? { year: "numeric" } : {}),
  }).format(new Date(iso));

export const describeDelta = (label: string, delta: TrendDelta): string => {
  if (delta.percentChange === null) return `${label}: no comparison available`;
  const word =
    delta.direction === "up"
      ? "up"
      : delta.direction === "down"
        ? "down"
        : "unchanged";
  return `${label}: ${word} ${Math.abs(delta.percentChange).toFixed(1)} percent versus the previous period`;
};
