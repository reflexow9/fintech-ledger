import type {
  AnalyticsSummary,
  CashFlowPoint,
  Category,
  CategorySlice,
  CurrencyCode,
  Kpi,
  Transaction,
  TrendDelta,
} from '@fintech/shared';
import { money, toMajorUnits } from '@fintech/shared';
import { forecastSpending } from './forecast.service';

const MS_PER_DAY = 86_400_000;

type Polarity = 'higher-is-better' | 'lower-is-better' | 'neutral';

export function buildDelta(current: number, previous: number, polarity: Polarity): TrendDelta {
  const absoluteChange = current - previous;
  const isFlat = previous !== 0 && Math.abs(absoluteChange / previous) < 0.005;
  const direction: TrendDelta['direction'] =
    isFlat || absoluteChange === 0 ? 'flat' : absoluteChange > 0 ? 'up' : 'down';

  let sentiment: TrendDelta['sentiment'] = 'neutral';
  if (direction !== 'flat' && polarity !== 'neutral') {
    const good = polarity === 'higher-is-better' ? direction === 'up' : direction === 'down';
    sentiment = good ? 'positive' : 'negative';
  }

  return {
    current,
    previous,
    absoluteChange,
    percentChange: previous === 0 ? null : (absoluteChange / previous) * 100,
    direction,
    sentiment,
  };
}

interface Window {
  readonly from: Date;
  readonly to: Date;
}

const inWindow = (tx: Transaction, window: Window): boolean => {
  const at = new Date(tx.timestamp).getTime();
  return at >= window.from.getTime() && at <= window.to.getTime();
};

const isSettled = (tx: Transaction): boolean => tx.status === 'completed';

function sumMinor(transactions: readonly Transaction[], type: Transaction['type']): number {
  return transactions
    .filter((tx) => tx.type === type && isSettled(tx))
    .reduce((acc, tx) => acc + tx.amount.minorUnits, 0);
}

export function buildCashFlowSeries(
  transactions: readonly Transaction[],
  window: Window,
): CashFlowPoint[] {
  const byDay = new Map<string, { income: number; expenses: number }>();
  const dayCount = Math.max(1, Math.round((window.to.getTime() - window.from.getTime()) / MS_PER_DAY));

  for (let i = 0; i <= dayCount; i += 1) {
    const key = new Date(window.from.getTime() + i * MS_PER_DAY).toISOString().slice(0, 10);
    byDay.set(key, { income: 0, expenses: 0 });
  }

  for (const tx of transactions) {
    if (!isSettled(tx) || !inWindow(tx, window)) continue;
    const key = tx.timestamp.slice(0, 10);
    const bucket = byDay.get(key);
    if (!bucket) continue;
    if (tx.type === 'income') bucket.income += tx.amount.minorUnits;
    else bucket.expenses += tx.amount.minorUnits;
  }

  return [...byDay.entries()].map(([date, totals]) => ({
    date,
    income: totals.income / 100,
    expenses: totals.expenses / 100,
    net: (totals.income - totals.expenses) / 100,
  }));
}

export function buildCategoryBreakdown(
  current: readonly Transaction[],
  previous: readonly Transaction[],
  currency: CurrencyCode,
): CategorySlice[] {
  const tally = (rows: readonly Transaction[]): Map<Category, { total: number; count: number }> => {
    const map = new Map<Category, { total: number; count: number }>();
    for (const tx of rows) {
      if (tx.type !== 'expense' || !isSettled(tx)) continue;
      const entry = map.get(tx.category) ?? { total: 0, count: 0 };
      entry.total += tx.amount.minorUnits;
      entry.count += 1;
      map.set(tx.category, entry);
    }
    return map;
  };

  const currentTally = tally(current);
  const previousTally = tally(previous);
  const grandTotal = [...currentTally.values()].reduce((acc, e) => acc + e.total, 0);

  return [...currentTally.entries()]
    .map(([category, entry]) => ({
      category,
      total: money(entry.total, currency),
      share: grandTotal === 0 ? 0 : entry.total / grandTotal,
      transactionCount: entry.count,
      delta: buildDelta(entry.total, previousTally.get(category)?.total ?? 0, 'lower-is-better'),
    }))
    .sort((a, b) => b.total.minorUnits - a.total.minorUnits);
}

function downsample(values: readonly number[], targetPoints = 12): number[] {
  if (values.length <= targetPoints) return [...values];
  const bucketSize = values.length / targetPoints;
  return Array.from({ length: targetPoints }, (_, i) => {
    const slice = values.slice(Math.floor(i * bucketSize), Math.floor((i + 1) * bucketSize));
    return slice.length === 0 ? 0 : slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

export interface OverviewOptions {
  readonly rangeDays?: number;
  readonly now?: Date;
}

export function buildAnalyticsSummary(
  workspaceId: string,
  currency: CurrencyCode,
  transactions: readonly Transaction[],
  options: OverviewOptions = {},
): AnalyticsSummary {
  const rangeDays = options.rangeDays ?? 30;
  const now = options.now ?? new Date();

  const currentWindow: Window = { from: new Date(now.getTime() - rangeDays * MS_PER_DAY), to: now };
  const previousWindow: Window = {
    from: new Date(currentWindow.from.getTime() - rangeDays * MS_PER_DAY),
    to: currentWindow.from,
  };

  const current = transactions.filter((tx) => inWindow(tx, currentWindow));
  const previous = transactions.filter((tx) => inWindow(tx, previousWindow));

  const income = sumMinor(current, 'income');
  const expenses = sumMinor(current, 'expense');
  const previousIncome = sumMinor(previous, 'income');
  const previousExpenses = sumMinor(previous, 'expense');

  const savingsRate = income === 0 ? 0 : ((income - expenses) / income) * 100;
  const previousSavingsRate =
    previousIncome === 0 ? 0 : ((previousIncome - previousExpenses) / previousIncome) * 100;

  const cashFlow = buildCashFlowSeries(transactions, currentWindow);

  const kpis: Kpi[] = [
    {
      id: 'netCashFlow',
      label: 'Net cash flow',
      unit: 'currency',
      value: money(income - expenses, currency),
      delta: buildDelta(income - expenses, previousIncome - previousExpenses, 'higher-is-better'),
      spark: downsample(cashFlow.map((p) => p.net)),
    },
    {
      id: 'totalIncome',
      label: 'Income',
      unit: 'currency',
      value: money(income, currency),
      delta: buildDelta(income, previousIncome, 'higher-is-better'),
      spark: downsample(cashFlow.map((p) => p.income)),
    },
    {
      id: 'totalExpenses',
      label: 'Expenses',
      unit: 'currency',
      value: money(expenses, currency),
      delta: buildDelta(expenses, previousExpenses, 'lower-is-better'),
      spark: downsample(cashFlow.map((p) => p.expenses)),
    },
    {
      id: 'savingsRate',
      label: 'Savings rate',
      unit: 'percent',
      value: Number(savingsRate.toFixed(1)),
      delta: buildDelta(savingsRate, previousSavingsRate, 'higher-is-better'),
      spark: downsample(cashFlow.map((p) => (p.income === 0 ? 0 : (p.net / p.income) * 100))),
    },
    {
      id: 'averageDailySpend',
      label: 'Average daily spend',
      unit: 'currency',
      value: money(Math.round(expenses / rangeDays), currency),
      delta: buildDelta(
        expenses / rangeDays,
        previousExpenses / rangeDays,
        'lower-is-better',
      ),
      spark: downsample(cashFlow.map((p) => p.expenses)),
    },
  ];

  return {
    workspaceId,
    currency,
    range: { from: currentWindow.from.toISOString(), to: currentWindow.to.toISOString() },
    kpis,
    cashFlow,
    categories: buildCategoryBreakdown(current, previous, currency),
    forecast: forecastSpending(transactions, currency, { horizonDays: 30, historyDays: 90, now }),
    generatedAt: now.toISOString(),
  };
}

export const formatMajor = (minorUnits: number, currency: CurrencyCode): number =>
  toMajorUnits(money(minorUnits, currency));
