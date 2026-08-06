import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import type {
  Page,
  SortDirection,
  Transaction,
  TransactionSortField,
} from "@fintech/shared";
import { formatDate, formatMoney } from "../../lib/format";

interface TransactionsTableProps {
  readonly page: Page<Transaction> | null;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly error: string | null;
  readonly search: string;
  readonly sortBy: TransactionSortField;
  readonly sortDir: SortDirection;
  onSearchChange(value: string): void;
  onSortChange(field: TransactionSortField): void;
  onPageChange(page: number): void;
}

const COLUMNS: ReadonlyArray<{
  field: TransactionSortField | null;
  label: string;
  align: "left" | "right";
}> = [
  { field: "timestamp", label: "Date", align: "left" },
  { field: "merchant", label: "Merchant", align: "left" },
  { field: "category", label: "Category", align: "left" },
  { field: null, label: "Status", align: "left" },
  { field: "amount", label: "Amount", align: "right" },
];

export function TransactionsTable(props: TransactionsTableProps): JSX.Element {
  const { page, isLoading, isRefreshing, error } = props;
  const [inputValue, setInputValue] = useState(props.search);

  return (
    <section className="panel" aria-label="Transaction ledger">
      <header
        className="flex flex-wrap items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: "var(--rule)" }}
      >
        <div>
          <h2 className="display text-[15px] font-semibold">Ledger</h2>
          <p className="eyebrow mt-0.5 figure">
            {page ? `${page.total.toLocaleString()} rows` : "—"}
            {isRefreshing && <span className="ml-2 opacity-60">updating…</span>}
          </p>
        </div>

        <div className="ml-auto relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--graphite)" }}
            aria-hidden="true"
          />
          <input
            type="search"
            value={inputValue}
            onChange={(event) => {
              setInputValue(event.target.value);
              props.onSearchChange(event.target.value);
            }}
            placeholder="Search merchants — try 'amazn'"
            aria-label="Search transactions"
            className="w-64 rounded border bg-transparent pl-8 pr-3 py-1.5 text-[12.5px] outline-none"
            style={{ borderColor: "var(--rule)", color: "var(--parchment)" }}
          />
        </div>
      </header>

      {error && (
        <p
          className="px-4 py-3 text-[12.5px]"
          style={{ color: "var(--outflow)" }}
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const isSorted = props.sortBy === column.field;
                return (
                  <th
                    key={column.label}
                    scope="col"
                    className="border-b px-4 py-2 font-normal"
                    style={{
                      borderColor: "var(--rule)",
                      textAlign: column.align,
                      color: "var(--graphite)",
                    }}
                    aria-sort={
                      isSorted
                        ? props.sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    {column.field ? (
                      <button
                        type="button"
                        onClick={() =>
                          props.onSortChange(
                            column.field as TransactionSortField,
                          )
                        }
                        className="eyebrow inline-flex items-center gap-1"
                        style={{
                          color: isSorted
                            ? "var(--parchment)"
                            : "var(--graphite)",
                        }}
                      >
                        {column.label}
                        {isSorted &&
                          (props.sortDir === "asc" ? (
                            <ArrowUp size={11} />
                          ) : (
                            <ArrowDown size={11} />
                          ))}
                      </button>
                    ) : (
                      <span className="eyebrow">{column.label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody
            style={{
              opacity: isRefreshing ? 0.55 : 1,
              transition: "opacity 120ms",
            }}
          >
            {isLoading && <SkeletonRows />}

            {!isLoading &&
              page?.items.map((tx) => {
                const isExpense = tx.type === "expense";
                return (
                  <tr
                    key={tx.id}
                    className="border-b"
                    style={{ borderColor: "var(--rule)" }}
                  >
                    <td
                      className="figure px-4 py-2.5 whitespace-nowrap"
                      style={{ color: "var(--graphite)" }}
                    >
                      {formatDate(tx.timestamp, "long")}
                    </td>
                    <td className="px-4 py-2.5">
                      {tx.merchant}
                      {tx.note && (
                        <span
                          className="ml-2 text-[11px]"
                          style={{ color: "var(--graphite)" }}
                        >
                          {tx.note}
                        </span>
                      )}
                    </td>
                    <td
                      className="px-4 py-2.5 capitalize"
                      style={{ color: "var(--graphite)" }}
                    >
                      {tx.category}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={tx.status} />
                    </td>
                    <td
                      className="figure px-4 py-2.5 text-right whitespace-nowrap"
                      style={{
                        color: isExpense ? "var(--outflow)" : "var(--inflow)",
                      }}
                    >
                      {isExpense ? "−" : "+"}
                      {formatMoney(tx.amount).replace("-", "")}
                    </td>
                  </tr>
                );
              })}

            {!isLoading && page?.items.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-10 text-center">
                  <p
                    className="text-[13px]"
                    style={{ color: "var(--parchment)" }}
                  >
                    No transactions match this search.
                  </p>
                  <p
                    className="text-[12px] mt-1"
                    style={{ color: "var(--graphite)" }}
                  >
                    Try a shorter merchant name, or clear the filters to see the
                    full ledger.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {page && page.pageCount > 1 && (
        <nav
          className="flex items-center justify-between px-4 py-2.5 border-t"
          style={{ borderColor: "var(--rule)" }}
          aria-label="Ledger pages"
        >
          <span
            className="figure text-[11.5px]"
            style={{ color: "var(--graphite)" }}
          >
            {(page.page - 1) * page.pageSize + 1}–
            {Math.min(page.page * page.pageSize, page.total)} of{" "}
            {page.total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <PageButton
              label="Previous page"
              disabled={page.page <= 1}
              onClick={() => props.onPageChange(page.page - 1)}
            >
              <ChevronLeft size={14} />
            </PageButton>
            <span
              className="figure text-[11.5px] px-2"
              style={{ color: "var(--graphite)" }}
            >
              {page.page} / {page.pageCount}
            </span>
            <PageButton
              label="Next page"
              disabled={page.page >= page.pageCount}
              onClick={() => props.onPageChange(page.page + 1)}
            >
              <ChevronRight size={14} />
            </PageButton>
          </div>
        </nav>
      )}
    </section>
  );
}

function StatusPill({
  status,
}: {
  status: Transaction["status"];
}): JSX.Element {
  const color =
    status === "completed"
      ? "var(--graphite)"
      : status === "pending"
        ? "var(--gold)"
        : "var(--outflow)";
  return (
    <span
      className="eyebrow inline-flex items-center gap-1.5"
      style={{ color }}
      title={
        status === "pending" ? "Excluded from KPIs until it settles" : undefined
      }
    >
      <span
        className="h-1 w-1 rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />
      {status}
    </span>
  );
}

function PageButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: JSX.Element;
  disabled: boolean;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded border p-1 disabled:opacity-30"
      style={{ borderColor: "var(--rule)", color: "var(--parchment)" }}
    >
      {children}
    </button>
  );
}

function SkeletonRows(): JSX.Element {
  return (
    <>
      {Array.from({ length: 8 }, (_, index) => (
        <tr
          key={index}
          className="border-b"
          style={{ borderColor: "var(--rule)" }}
        >
          <td colSpan={5} className="px-4 py-3">
            <div
              className="h-3 rounded animate-pulse"
              style={{ background: "var(--rule)" }}
            />
          </td>
        </tr>
      ))}
    </>
  );
}
