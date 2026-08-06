import { useCallback, useState } from "react";
import type { SortDirection, TransactionSortField } from "@fintech/shared";
import { AppShell, TopBar } from "../components/layout/AppShell";
import { KpiCard, KpiCardSkeleton } from "../components/kpi/KpiCard";
import { CashFlowChart } from "../components/charts/CashFlowChart";
import { CategoryDonut } from "../components/charts/CategoryDonut";
import { TransactionsTable } from "../components/transactions/TransactionsTable";
import { AddTransactionDialog } from "../components/transactions/AddTransactionDialog";
import { ImportWizard } from "../components/import/ImportWizard";
import { BudgetsPanel } from "../components/budgets/BudgetsPanel";
import {
  useAnalyticsOverview,
  useBudgets,
  useDebounced,
  useTransactions,
} from "../hooks/useFinancialData";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../lib/format";

export function DashboardPage(): JSX.Element {
  const { activeWorkspace, status } = useAuth();
  const [view, setView] = useState("overview");
  const [rangeDays, setRangeDays] = useState(30);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 250);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<TransactionSortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const overview = useAnalyticsOverview(rangeDays);
  const ledger = useTransactions({
    page,
    pageSize: 25,
    sortBy,
    sortDir,
    ...(search ? { search } : {}),
  });
  const budgets = useBudgets();

  const handleSort = useCallback(
    (field: TransactionSortField): void => {
      setSortDir((current) =>
        sortBy === field && current === "desc" ? "asc" : "desc",
      );
      setSortBy(field);
      setPage(1);
    },
    [sortBy],
  );

  const handleSearch = useCallback((value: string): void => {
    setSearchInput(value);
    setPage(1);
  }, []);

  const refreshAll = useCallback((): void => {
    overview.reload();
    ledger.reload();
    budgets.reload();
  }, [overview, ledger, budgets]);

  if (status !== "authenticated") {
    return (
      <div
        className="min-h-screen grid place-items-center"
        style={{ background: "var(--ink)" }}
      >
        <p className="eyebrow">Opening your workspace…</p>
      </div>
    );
  }

  const summary = overview.data;

  return (
    <AppShell activeView={view} onNavigate={setView}>
      <TopBar
        title={activeWorkspace?.name ?? "Workspace"}
        subtitle={
          summary
            ? `${formatDate(summary.range.from, "long")} — ${formatDate(summary.range.to, "long")} · ${summary.currency}`
            : "Loading range"
        }
        rangeDays={rangeDays}
        onRangeChange={setRangeDays}
        isRefreshing={overview.isRefreshing}
        onAddTransaction={() => setIsAddOpen(true)}
      />

      <AddTransactionDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreated={() => {
          refreshAll();
          setPage(1);
          setSortBy("timestamp");
          setSortDir("desc");
        }}
      />

      <div className="p-6 space-y-5">
        {overview.error && (
          <div
            className="rounded border px-3 py-2 text-[12.5px] flex items-center justify-between gap-3"
            style={{ borderColor: "var(--outflow)", color: "var(--outflow)" }}
            role="alert"
          >
            {overview.error}
            <button
              type="button"
              onClick={overview.reload}
              className="underline"
            >
              Try again
            </button>
          </div>
        )}

        {(view === "overview" || view === "ledger") && (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
            {overview.isLoading
              ? Array.from({ length: 5 }, (_, index) => (
                  <KpiCardSkeleton key={index} />
                ))
              : summary?.kpis.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} />)}
          </div>
        )}

        {view === "overview" && summary && (
          <div className="grid gap-5 grid-cols-1 xl:grid-cols-[5fr_3fr]">
            <CashFlowChart
              history={summary.cashFlow}
              forecast={summary.forecast}
              currency={summary.currency}
            />
            <CategoryDonut
              slices={summary.categories}
              currency={summary.currency}
            />
          </div>
        )}

        {(view === "overview" || view === "ledger") && (
          <TransactionsTable
            page={ledger.data}
            isLoading={ledger.isLoading}
            isRefreshing={ledger.isRefreshing}
            error={ledger.error}
            search={searchInput}
            sortBy={sortBy}
            sortDir={sortDir}
            onSearchChange={handleSearch}
            onSortChange={handleSort}
            onPageChange={setPage}
          />
        )}

        {view === "import" && <ImportWizard onImported={refreshAll} />}

        {view === "budgets" && (
          <BudgetsPanel
            budgets={budgets.data ?? []}
            isLoading={budgets.isLoading}
            error={budgets.error}
            onReload={budgets.reload}
            onChanged={budgets.reload}
          />
        )}
      </div>
    </AppShell>
  );
}
