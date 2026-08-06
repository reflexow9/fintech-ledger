import type {
  Budget,
  BudgetPeriod,
  Category,
  CurrencyCode,
  Transaction,
  TransactionStatus,
  TransactionType,
  Workspace,
  WorkspaceKind,
} from './domain';
import type { AnalyticsSummary } from './analytics';

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

export interface ApiError {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly issues?: readonly FieldIssue[];
  readonly requestId: string;
}

export type ApiResponse<T> =
  | { readonly ok: true; readonly data: T; readonly requestId: string }
  | { readonly ok: false; readonly error: ApiError };

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
}

export const TRANSACTION_SORT_FIELDS = ['timestamp', 'amount', 'merchant', 'category'] as const;
export type TransactionSortField = (typeof TRANSACTION_SORT_FIELDS)[number];
export type SortDirection = 'asc' | 'desc';

export interface TransactionQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: TransactionSortField;
  readonly sortDir?: SortDirection;
  readonly search?: string;
  readonly type?: TransactionType;
  readonly status?: TransactionStatus;
  readonly categories?: readonly Category[];
  readonly from?: string;
  readonly to?: string;
  readonly minAmount?: number;
  readonly maxAmount?: number;
}

export interface CreateTransactionRequest {
  readonly merchant: string;
  readonly amount: string;
  readonly type: TransactionType;
  readonly category: Category;
  readonly currency?: CurrencyCode;
  readonly status?: TransactionStatus;
  readonly timestamp?: string;
  readonly note?: string;
}

export type CreateTransactionResponse = ApiResponse<Transaction>;

export const IMPORTABLE_FIELDS = [
  'timestamp',
  'merchant',
  'amount',
  'currency',
  'type',
  'category',
  'status',
  'note',
] as const;
export type ImportableField = (typeof IMPORTABLE_FIELDS)[number];

export type SchemaMapping = Readonly<Record<ImportableField, string | null>>;

export interface ImportCsvRequest {
  readonly workspaceId: string;
  readonly csv: string;
  readonly mapping: SchemaMapping;
  readonly defaults?: {
    readonly currency?: CurrencyCode;
    readonly status?: TransactionStatus;
    readonly category?: Category;
  };
  readonly dryRun?: boolean;
}

export type ImportIssueCode =
  | 'REQUIRED_FIELD_MISSING'
  | 'UNPARSABLE_AMOUNT'
  | 'UNPARSABLE_DATE'
  | 'FUTURE_DATE'
  | 'UNKNOWN_ENUM_VALUE'
  | 'UNSUPPORTED_CURRENCY'
  | 'DUPLICATE_ROW'
  | 'COLUMN_COUNT_MISMATCH';

export interface ImportRowIssue {
  readonly line: number;
  readonly field: ImportableField | null;
  readonly code: ImportIssueCode;
  readonly message: string;
  readonly rawValue: string | null;
  readonly severity: 'error' | 'warning';
}

export interface ImportCsvResult {
  readonly batchId: string;
  readonly dryRun: boolean;
  readonly totalRows: number;
  readonly acceptedRows: number;
  readonly rejectedRows: number;
  readonly issues: readonly ImportRowIssue[];
  readonly preview: readonly Transaction[];
}

export type OverviewResponse = ApiResponse<AnalyticsSummary>;
export type TransactionsResponse = ApiResponse<Page<Transaction>>;
export type ImportCsvResponse = ApiResponse<ImportCsvResult>;
export type BudgetsResponse = ApiResponse<readonly Budget[]>;

export interface CreateBudgetRequest {
  readonly category: Category;
  readonly limit: string;
  readonly period?: BudgetPeriod;
}

export type CreateBudgetResponse = ApiResponse<Budget>;
export type DeleteBudgetResponse = ApiResponse<{ readonly id: string }>;

export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: 'owner' | 'analyst' | 'viewer';
}

export interface Session {
  readonly token: string;
  readonly user: SessionUser;
  readonly workspaces: readonly Workspace[];
  readonly activeWorkspaceId: string;
  readonly expiresAt: string;
}

export type { WorkspaceKind };
