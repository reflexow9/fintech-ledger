import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, Plus, Trash2, X } from 'lucide-react';
import type { Budget, BudgetPeriod, Category, CreateBudgetRequest } from '@fintech/shared';
import { BUDGET_PERIODS, CATEGORIES } from '@fintech/shared';
import { api, ApiClientError } from '../../lib/api-client';
import { useAuth } from '../../context/AuthContext';
import { formatMoney } from '../../lib/format';

const LIMITABLE_CATEGORIES: readonly Category[] = CATEGORIES.filter((c) => c !== 'revenue');

const PERIOD_LABEL: Readonly<Record<BudgetPeriod, string>> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

interface BudgetsPanelProps {
  readonly budgets: readonly Budget[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly onReload: () => void;
  readonly onChanged: () => void;
}

export function BudgetsPanel({
  budgets,
  isLoading,
  error,
  onReload,
  onChanged,
}: BudgetsPanelProps): JSX.Element {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { token, activeWorkspace } = useAuth();

  const removeBudget = useCallback(
    async (id: string): Promise<void> => {
      setBusyId(id);
      try {
        await api.deleteBudget({ token, workspaceId: activeWorkspace?.id ?? null }, id);
        onChanged();
      } catch {
        onReload();
      } finally {
        setBusyId(null);
      }
    },
    [token, activeWorkspace, onChanged, onReload],
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="display text-[15px] font-semibold">Spending limits</h2>
          <p className="eyebrow mt-1">{budgets.length} active</p>
        </div>
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[12.5px] font-medium"
          style={{ background: 'var(--parchment)', color: 'var(--ink)' }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Add limit
        </button>
      </div>

      {error && (
        <div
          className="rounded border px-3 py-2 text-[12.5px] flex items-center justify-between gap-3"
          style={{ borderColor: 'var(--outflow)', color: 'var(--outflow)' }}
          role="alert"
        >
          {error}
          <button type="button" onClick={onReload} className="underline">
            Try again
          </button>
        </div>
      )}

      {isLoading && budgets.length === 0 ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="panel p-4 h-[132px] animate-pulse" style={{ background: 'var(--surface)' }} />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <section className="panel p-8 text-center">
          <h3 className="display text-[14px] font-semibold">No limits set</h3>
          <p className="mt-2 text-[13px]" style={{ color: 'var(--graphite)' }}>
            Set a limit per category to track pace against the period, not just the remaining
            balance. Click "Add limit" to create your first one.
          </p>
        </section>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              isBusy={busyId === budget.id}
              onDelete={() => void removeBudget(budget.id)}
            />
          ))}
        </div>
      )}

      <AddBudgetDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        existingCategories={budgets.map((b) => b.category)}
        onCreated={onChanged}
      />
    </section>
  );
}

function BudgetCard({
  budget,
  isBusy,
  onDelete,
}: {
  budget: Budget;
  isBusy: boolean;
  onDelete: () => void;
}): JSX.Element {
  const isOver = budget.spent.minorUnits > budget.limit.minorUnits;
  const share = budget.limit.minorUnits === 0 ? 0 : budget.spent.minorUnits / budget.limit.minorUnits;
  const barColor = isOver ? 'var(--outflow)' : 'var(--inflow)';
  const overBy = budget.spent.minorUnits - budget.limit.minorUnits;

  return (
    <div className="panel p-4" style={{ borderColor: isOver ? 'var(--outflow)' : 'var(--rule)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-medium capitalize truncate" style={{ color: 'var(--parchment)' }}>
            {budget.category}
          </h3>
          <p className="eyebrow mt-0.5">{PERIOD_LABEL[budget.period]}</p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={isBusy}
          aria-label={`Remove limit for ${budget.category}`}
          style={{ color: 'var(--graphite)' }}
          className="shrink-0 disabled:opacity-40"
        >
          {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="figure text-[15px]" style={{ color: isOver ? 'var(--outflow)' : 'var(--parchment)' }}>
          {formatMoney(budget.spent)}
        </span>
        <span className="figure text-[11.5px]" style={{ color: 'var(--graphite)' }}>
          of {formatMoney(budget.limit)}
        </span>
      </div>

      <div
        className="mt-2 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--surface-raised)' }}
        role="progressbar"
        aria-valuenow={Math.round(share * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${budget.category} spent`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, share * 100)}%`, background: barColor }}
        />
      </div>

      {isOver ? (
        <p
          className="mt-2.5 flex items-start gap-1.5 text-[12px]"
          style={{ color: 'var(--outflow)' }}
          role="alert"
        >
          <AlertTriangle size={13} className="shrink-0 mt-[1px]" />
          You've exceeded your limit for {budget.category} by {formatMoney({ ...budget.limit, minorUnits: overBy })}
        </p>
      ) : (
        <p className="mt-2.5 text-[11.5px]" style={{ color: 'var(--graphite)' }}>
          {Math.round(share * 100)}% used · {Math.round(budget.periodProgress * 100)}% of period elapsed
        </p>
      )}
    </div>
  );
}

interface AddBudgetDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly existingCategories: readonly Category[];
  readonly onCreated: () => void;
}

function AddBudgetDialog({
  isOpen,
  onClose,
  existingCategories,
  onCreated,
}: AddBudgetDialogProps): JSX.Element | null {
  const { token, activeWorkspace } = useAuth();
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  const [category, setCategory] = useState<Category>(LIMITABLE_CATEGORIES[0]!);
  const [limit, setLimit] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [isBusy, setIsBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  const reset = useCallback((): void => {
    setCategory(LIMITABLE_CATEGORIES[0]!);
    setLimit('');
    setPeriod('monthly');
    setFormError(null);
    setFieldErrors({});
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    firstFieldRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const alreadyBudgeted = existingCategories.includes(category);

  const submit = useCallback(async (): Promise<void> => {
    setIsBusy(true);
    setFormError(null);
    setFieldErrors({});

    const payload: CreateBudgetRequest = { category, limit, period };

    try {
      await api.createBudget({ token, workspaceId: activeWorkspace?.id ?? null }, payload);
      reset();
      onCreated();
      onClose();
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        setFormError(cause.message);
        setFieldErrors(
          Object.fromEntries((cause.issues ?? []).map((issue) => [issue.path, issue.message])),
        );
      } else {
        setFormError('Could not save this limit. Try again');
      }
    } finally {
      setIsBusy(false);
    }
  }, [category, limit, period, token, activeWorkspace, reset, onCreated, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] overflow-y-auto"
      style={{ background: 'color-mix(in srgb, #000 62%, transparent)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-budget-title"
    >
      <div className="panel w-full max-w-sm" style={{ background: 'var(--surface)' }}>
        <header
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--rule)' }}
        >
          <div>
            <h2 id="add-budget-title" className="display text-[15px] font-semibold">
              New limit
            </h2>
            <p className="eyebrow mt-0.5">
              {activeWorkspace?.name ?? '—'} · {activeWorkspace?.baseCurrency ?? '—'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ color: 'var(--graphite)' }}>
            <X size={16} />
          </button>
        </header>

        <div className="p-4 space-y-4">
          <Field label="Category" error={fieldErrors.category}>
            <select
              ref={firstFieldRef}
              value={category}
              onChange={(event) => setCategory(event.target.value as Category)}
              className="w-full rounded border px-2.5 py-2 text-[13px] outline-none capitalize"
              style={{
                borderColor: fieldErrors.category ? 'var(--outflow)' : 'var(--rule)',
                color: 'var(--parchment)',
                background: 'var(--surface-raised)',
              }}
            >
              {LIMITABLE_CATEGORIES.map((option) => (
                <option key={option} value={option} className="capitalize">
                  {option}
                </option>
              ))}
            </select>
            {alreadyBudgeted && (
              <span className="mt-1 block text-[11.5px]" style={{ color: 'var(--gold)' }}>
                Already has a limit — saving will replace it.
              </span>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Limit" error={fieldErrors.limit}>
              <input
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !isBusy) void submit();
                }}
                className="figure w-full rounded border bg-transparent px-2.5 py-2 text-[14px] outline-none"
                style={{
                  borderColor: fieldErrors.limit ? 'var(--outflow)' : 'var(--rule)',
                  color: 'var(--parchment)',
                }}
              />
            </Field>

            <Field label="Resets">
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value as BudgetPeriod)}
                className="w-full rounded border px-2.5 py-2 text-[13px] outline-none capitalize"
                style={{ borderColor: 'var(--rule)', color: 'var(--parchment)', background: 'var(--surface-raised)' }}
              >
                {BUDGET_PERIODS.map((option) => (
                  <option key={option} value={option} className="capitalize">
                    {PERIOD_LABEL[option]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {formError && (
            <p className="text-[12.5px]" style={{ color: 'var(--outflow)' }} role="alert">
              {formError}
            </p>
          )}
        </div>

        <footer
          className="flex items-center justify-between gap-3 px-4 py-3 border-t"
          style={{ borderColor: 'var(--rule)' }}
        >
          <button type="button" onClick={onClose} className="text-[12.5px]" style={{ color: 'var(--graphite)' }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={isBusy || limit.trim() === ''}
            className="flex items-center gap-2 rounded px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-40"
            style={{ background: 'var(--gold)', color: 'var(--ink)' }}
          >
            {isBusy && <Loader2 size={13} className="animate-spin" />}
            Save limit
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}): JSX.Element {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error && (
        <span className="mt-1 block text-[11.5px]" style={{ color: 'var(--outflow)' }}>
          {error}
        </span>
      )}
    </label>
  );
}
