import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalyticsSummary,
  Budget,
  Page,
  Transaction,
  TransactionQuery,
} from "@fintech/shared";
import { api, ApiClientError, type AuthedContext } from "../lib/api-client";
import { useAuth } from "../context/AuthContext";

export interface AsyncState<T> {
  readonly data: T | null;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly error: string | null;
  reload(): void;
}

function useAuthedContext(): AuthedContext | null {
  const { token, activeWorkspace } = useAuth();
  if (!token || !activeWorkspace) return null;
  return { token, workspaceId: activeWorkspace.id };
}

function useAsyncResource<T>(
  fetcher: ((ctx: AuthedContext) => Promise<T>) | null,
  deps: readonly unknown[],
): AsyncState<T> {
  const context = useAuthedContext();
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const hasData = useRef(false);

  useEffect(() => {
    if (!context || !fetcher) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetcher({ ...context, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        hasData.current = true;
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof ApiClientError
            ? `${cause.message} (ref ${cause.requestId})`
            : "Something went wrong loading this view",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [context?.token, context?.workspaceId, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    data,
    isLoading: isLoading && !hasData.current,
    isRefreshing: isLoading && hasData.current,
    error,
    reload,
  };
}

export function useAnalyticsOverview(
  rangeDays: number,
): AsyncState<AnalyticsSummary> {
  return useAsyncResource<AnalyticsSummary>(
    (ctx) => api.getOverview(ctx, rangeDays),
    [rangeDays],
  );
}

export function useTransactions(
  query: TransactionQuery,
): AsyncState<Page<Transaction>> {
  const key = JSON.stringify(query);
  return useAsyncResource<Page<Transaction>>(
    (ctx) => api.getTransactions(ctx, query),
    [key],
  );
}

export function useBudgets(): AsyncState<readonly Budget[]> {
  return useAsyncResource<readonly Budget[]>((ctx) => api.getBudgets(ctx), []);
}

export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
