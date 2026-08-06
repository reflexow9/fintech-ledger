import type { Category, CurrencyCode, Money } from './domain';

export interface TrendDelta {
  readonly current: number;
  readonly previous: number;
  readonly absoluteChange: number;
  readonly percentChange: number | null;
  readonly direction: 'up' | 'down' | 'flat';
  readonly sentiment: 'positive' | 'negative' | 'neutral';
}

export type KpiId =
  | 'netCashFlow'
  | 'totalIncome'
  | 'totalExpenses'
  | 'savingsRate'
  | 'averageDailySpend';

export interface Kpi {
  readonly id: KpiId;
  readonly label: string;
  readonly unit: 'currency' | 'percent';
  readonly value: Money | number;
  readonly delta: TrendDelta;
  readonly spark: readonly number[];
}

export interface CashFlowPoint {
  readonly date: string;
  readonly income: number;
  readonly expenses: number;
  readonly net: number;
}

export interface CategorySlice {
  readonly category: Category;
  readonly total: Money;
  readonly share: number;
  readonly transactionCount: number;
  readonly delta: TrendDelta;
}

export interface ForecastPoint {
  readonly date: string;
  readonly projected: number;
  readonly lowerBound: number;
  readonly upperBound: number;
}

export type ForecastMethod = 'linear-regression' | 'moving-average' | 'insufficient-data';

export interface SpendForecast {
  readonly method: ForecastMethod;
  readonly horizonDays: number;
  readonly points: readonly ForecastPoint[];
  readonly projectedTotal: Money;
  readonly rSquared: number;
  readonly dailyTrendMinorUnits: number;
  readonly sampleSize: number;
  readonly generatedAt: string;
}

export interface AnalyticsSummary {
  readonly workspaceId: string;
  readonly currency: CurrencyCode;
  readonly range: { readonly from: string; readonly to: string };
  readonly kpis: readonly Kpi[];
  readonly cashFlow: readonly CashFlowPoint[];
  readonly categories: readonly CategorySlice[];
  readonly forecast: SpendForecast;
  readonly generatedAt: string;
}
