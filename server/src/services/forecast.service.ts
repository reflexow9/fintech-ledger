import type {
  ForecastMethod,
  ForecastPoint,
  SpendForecast,
  CurrencyCode,
  Transaction,
} from '@fintech/shared';
import { money } from '@fintech/shared';

const MS_PER_DAY = 86_400_000;
const DEFAULT_HORIZON_DAYS = 30;
const MIN_DAYS_FOR_REGRESSION = 14;
const MIN_DAYS_FOR_ANY_FORECAST = 3;
const Z_95 = 1.96;

interface DailyBucket {
  readonly dayIndex: number;
  readonly date: string;
  readonly minorUnits: number;
}

interface OlsFit {
  readonly slope: number;
  readonly intercept: number;
  readonly rSquared: number;
  readonly residualStdError: number;
  readonly meanX: number;
  readonly sumSquaredX: number;
}

const toDateKey = (iso: string): string => iso.slice(0, 10);

const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * MS_PER_DAY);

export function bucketDailyExpenses(
  transactions: readonly Transaction[],
  windowDays: number,
  now: Date = new Date(),
): DailyBucket[] {
  const windowStart = addDays(now, -windowDays);
  const totals = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.type !== 'expense' || tx.status !== 'completed') continue;
    const occurredAt = new Date(tx.timestamp);
    if (Number.isNaN(occurredAt.getTime())) continue;
    if (occurredAt < windowStart || occurredAt > now) continue;

    const key = toDateKey(tx.timestamp);
    totals.set(key, (totals.get(key) ?? 0) + tx.amount.minorUnits);
  }

  const buckets: DailyBucket[] = [];
  for (let i = 0; i < windowDays; i += 1) {
    const date = addDays(windowStart, i);
    const key = date.toISOString().slice(0, 10);
    buckets.push({ dayIndex: i, date: key, minorUnits: totals.get(key) ?? 0 });
  }
  return buckets;
}

export function computeWeekdayIndices(buckets: readonly DailyBucket[]): number[] {
  const sums = new Array<number>(7).fill(0);
  const counts = new Array<number>(7).fill(0);

  for (const bucket of buckets) {
    const weekday = new Date(`${bucket.date}T00:00:00Z`).getUTCDay();
    sums[weekday] = (sums[weekday] ?? 0) + bucket.minorUnits;
    counts[weekday] = (counts[weekday] ?? 0) + 1;
  }

  const overallMean =
    buckets.reduce((acc, b) => acc + b.minorUnits, 0) / Math.max(buckets.length, 1);

  if (overallMean <= 0) return new Array<number>(7).fill(1);

  return sums.map((sum, weekday) => {
    const count = counts[weekday] ?? 0;
    if (count === 0) return 1;
    const raw = sum / count / overallMean;
    return Math.min(2, Math.max(0.5, raw));
  });
}

export function fitLinearRegression(points: ReadonlyArray<{ x: number; y: number }>): OlsFit {
  const n = points.length;
  if (n < 2) {
    return {
      slope: 0,
      intercept: points[0]?.y ?? 0,
      rSquared: 0,
      residualStdError: 0,
      meanX: 0,
      sumSquaredX: 0,
    };
  }

  const meanX = points.reduce((acc, p) => acc + p.x, 0) / n;
  const meanY = points.reduce((acc, p) => acc + p.y, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    sxy += dx * (p.y - meanY);
    sxx += dx * dx;
  }

  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    const predicted = slope * p.x + intercept;
    ssRes += (p.y - predicted) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }

  const rSquared = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
  const residualStdError = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;

  return { slope, intercept, rSquared, residualStdError, meanX, sumSquaredX: sxx };
}

export function movingAverage(values: readonly number[], window: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-Math.min(window, values.length));
  return slice.reduce((acc, v) => acc + v, 0) / slice.length;
}

export interface ForecastOptions {
  readonly horizonDays?: number;
  readonly historyDays?: number;
  readonly now?: Date;
}

export function forecastSpending(
  transactions: readonly Transaction[],
  currency: CurrencyCode,
  options: ForecastOptions = {},
): SpendForecast {
  const horizonDays = options.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const historyDays = options.historyDays ?? 90;
  const now = options.now ?? new Date();

  const buckets = bucketDailyExpenses(transactions, historyDays, now);
  const daysWithActivity = buckets.filter((b) => b.minorUnits > 0).length;

  if (daysWithActivity < MIN_DAYS_FOR_ANY_FORECAST) {
    return emptyForecast(currency, horizonDays, now, daysWithActivity);
  }

  const method: ForecastMethod =
    daysWithActivity >= MIN_DAYS_FOR_REGRESSION ? 'linear-regression' : 'moving-average';

  const weekdayIndices = computeWeekdayIndices(buckets);

  const deseasonalised = buckets.map((bucket) => {
    const weekday = new Date(`${bucket.date}T00:00:00Z`).getUTCDay();
    const index = weekdayIndices[weekday] ?? 1;
    return { x: bucket.dayIndex, y: bucket.minorUnits / index };
  });

  const fit =
    method === 'linear-regression'
      ? fitLinearRegression(deseasonalised)
      : flatFit(movingAverage(deseasonalised.map((p) => p.y), 7));

  const points: ForecastPoint[] = [];
  let projectedTotalMinor = 0;

  for (let step = 1; step <= horizonDays; step += 1) {
    const x = buckets.length - 1 + step;
    const date = addDays(now, step);
    const weekday = date.getUTCDay();
    const seasonalIndex = weekdayIndices[weekday] ?? 1;

    const trendValue = Math.max(0, fit.slope * x + fit.intercept);
    const projected = trendValue * seasonalIndex;

    const leverage =
      fit.sumSquaredX > 0
        ? 1 + 1 / deseasonalised.length + (x - fit.meanX) ** 2 / fit.sumSquaredX
        : 1;
    const margin = Z_95 * fit.residualStdError * Math.sqrt(leverage) * seasonalIndex;

    points.push({
      date: date.toISOString().slice(0, 10),
      projected: Math.round(projected),
      lowerBound: Math.round(Math.max(0, projected - margin)),
      upperBound: Math.round(projected + margin),
    });

    projectedTotalMinor += projected;
  }

  return {
    method,
    horizonDays,
    points,
    projectedTotal: money(projectedTotalMinor, currency),
    rSquared: Number(fit.rSquared.toFixed(4)),
    dailyTrendMinorUnits: Math.round(fit.slope),
    sampleSize: daysWithActivity,
    generatedAt: now.toISOString(),
  };
}

const flatFit = (level: number): OlsFit => ({
  slope: 0,
  intercept: level,
  rSquared: 0,
  residualStdError: 0,
  meanX: 0,
  sumSquaredX: 0,
});

function emptyForecast(
  currency: CurrencyCode,
  horizonDays: number,
  now: Date,
  sampleSize: number,
): SpendForecast {
  return {
    method: 'insufficient-data',
    horizonDays,
    points: [],
    projectedTotal: money(0, currency),
    rSquared: 0,
    dailyTrendMinorUnits: 0,
    sampleSize,
    generatedAt: now.toISOString(),
  };
}
