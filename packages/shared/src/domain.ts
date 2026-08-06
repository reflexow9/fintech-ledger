export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'UAH'] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_EXPONENT: Readonly<Record<CurrencyCode, number>> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  UAH: 2,
};

export interface Money {
  readonly minorUnits: number;
  readonly currency: CurrencyCode;
}

export const TRANSACTION_TYPES = ['income', 'expense'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ['pending', 'completed', 'failed'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const CATEGORIES = [
  'housing',
  'groceries',
  'transport',
  'software',
  'payroll',
  'marketing',
  'travel',
  'utilities',
  'dining',
  'healthcare',
  'revenue',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const WORKSPACE_KINDS = ['personal', 'business'] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly kind: WorkspaceKind;
  readonly baseCurrency: CurrencyCode;
}

export interface Transaction {
  readonly id: string;
  readonly workspaceId: string;
  readonly amount: Money;
  readonly type: TransactionType;
  readonly status: TransactionStatus;
  readonly category: Category;
  readonly merchant: string;
  readonly timestamp: string;
  readonly note?: string;
  readonly importBatchId?: string;
}

export const BUDGET_PERIODS = ['weekly', 'monthly', 'quarterly'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export interface Budget {
  readonly id: string;
  readonly workspaceId: string;
  readonly category: Category;
  readonly limit: Money;
  readonly spent: Money;
  readonly period: BudgetPeriod;
  readonly periodProgress: number;
}

export const money = (minorUnits: number, currency: CurrencyCode): Money => ({
  minorUnits: Math.round(minorUnits),
  currency,
});

export const addMoney = (a: Money, b: Money): Money => {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} + ${b.currency}`);
  }
  return money(a.minorUnits + b.minorUnits, a.currency);
};

export const toMajorUnits = (value: Money): number =>
  value.minorUnits / 10 ** CURRENCY_EXPONENT[value.currency];

export const isCurrencyCode = (value: string): value is CurrencyCode =>
  (SUPPORTED_CURRENCIES as readonly string[]).includes(value);

export const isTransactionType = (value: string): value is TransactionType =>
  (TRANSACTION_TYPES as readonly string[]).includes(value);

export const isTransactionStatus = (value: string): value is TransactionStatus =>
  (TRANSACTION_STATUSES as readonly string[]).includes(value);

export const isCategory = (value: string): value is Category =>
  (CATEGORIES as readonly string[]).includes(value);

export const isBudgetPeriod = (value: string): value is BudgetPeriod =>
  (BUDGET_PERIODS as readonly string[]).includes(value);
