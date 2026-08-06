import type {
  AnalyticsSummary,
  ApiError,
  ApiResponse,
  Budget,
  CreateBudgetRequest,
  CreateTransactionRequest,
  ImportCsvRequest,
  ImportCsvResult,
  Page,
  Session,
  Transaction,
  TransactionQuery,
} from "@fintech/shared";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiClientError extends Error {
  readonly code: ApiError["code"];
  readonly requestId: string;
  readonly issues: ApiError["issues"];

  constructor(error: ApiError) {
    super(error.message);
    this.name = "ApiClientError";
    this.code = error.code;
    this.requestId = error.requestId;
    this.issues = error.issues;
  }
}

interface RequestOptions {
  readonly method?: "GET" | "POST" | "DELETE";
  readonly body?: unknown;
  readonly token?: string | null;
  readonly workspaceId?: string | null;
  readonly signal?: AbortSignal;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.workspaceId) headers["X-Workspace-Id"] = options.workspaceId;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    throw new ApiClientError({
      code: "INTERNAL",
      message: "Can't reach the server. Check your connection and try again",
      requestId: "offline",
    });
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!isApiResponse<T>(payload)) {
    throw new ApiClientError({
      code: "INTERNAL",
      message: "The server returned an unreadable response",
      requestId: response.headers.get("x-request-id") ?? "unknown",
    });
  }
  if (!payload.ok) throw new ApiClientError(payload.error);
  return payload.data;
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.ok === true) return "data" in candidate;
  if (candidate.ok === false)
    return typeof candidate.error === "object" && candidate.error !== null;
  return false;
}

export function toSearchParams(query: TransactionQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return params.toString();
}

export interface AuthedContext {
  readonly token: string | null;
  readonly workspaceId: string | null;
  readonly signal?: AbortSignal;
}

export const api = {
  signIn: (): Promise<Session> =>
    request<Session>("/api/auth/session", { method: "POST", body: {} }),

  getOverview: (
    ctx: AuthedContext,
    rangeDays: number,
  ): Promise<AnalyticsSummary> =>
    request<AnalyticsSummary>(
      `/api/analytics/overview?rangeDays=${rangeDays}`,
      ctx,
    ),

  getTransactions: (
    ctx: AuthedContext,
    query: TransactionQuery,
  ): Promise<Page<Transaction>> =>
    request<Page<Transaction>>(
      `/api/transactions?${toSearchParams(query)}`,
      ctx,
    ),

  createTransaction: (
    ctx: AuthedContext,
    body: CreateTransactionRequest,
  ): Promise<Transaction> =>
    request<Transaction>("/api/transactions", { ...ctx, method: "POST", body }),

  importCsv: (
    ctx: AuthedContext,
    body: Omit<ImportCsvRequest, "workspaceId">,
  ): Promise<ImportCsvResult> =>
    request<ImportCsvResult>("/api/transactions/import-csv", {
      ...ctx,
      method: "POST",
      body: { ...body, workspaceId: ctx.workspaceId },
    }),

  getBudgets: (ctx: AuthedContext): Promise<readonly Budget[]> =>
    request<readonly Budget[]>("/api/budgets", ctx),

  createBudget: (
    ctx: AuthedContext,
    body: CreateBudgetRequest,
  ): Promise<Budget> =>
    request<Budget>("/api/budgets", { ...ctx, method: "POST", body }),

  deleteBudget: (
    ctx: AuthedContext,
    budgetId: string,
  ): Promise<{ id: string }> =>
    request<{ id: string }>(`/api/budgets/${budgetId}`, {
      ...ctx,
      method: "DELETE",
    }),
};
