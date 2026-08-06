import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { Category, CreateTransactionRequest, TransactionType } from '@fintech/shared';
import { CATEGORIES } from '@fintech/shared';
import { api, ApiClientError } from '../../lib/api-client';
import { useAuth } from '../../context/AuthContext';

interface AddTransactionDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onCreated: () => void;
}

const DEFAULT_CATEGORY: Readonly<Record<TransactionType, Category>> = {
  expense: 'groceries',
  income: 'revenue',
};

const todayLocal = (): string => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
};

export function AddTransactionDialog({
  isOpen,
  onClose,
  onCreated,
}: AddTransactionDialogProps): JSX.Element | null {
  const { token, activeWorkspace } = useAuth();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<TransactionType>('expense');
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('groceries');
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState(todayLocal);
  const [isBusy, setIsBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  const reset = useCallback((): void => {
    setType('expense');
    setMerchant('');
    setAmount('');
    setCategory('groceries');
    setNote('');
    setOccurredAt(todayLocal());
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

  const changeType = (next: TransactionType): void => {
    setType(next);
    setCategory((current) => (current === DEFAULT_CATEGORY[type] ? DEFAULT_CATEGORY[next] : current));
  };

  const submit = useCallback(async (): Promise<void> => {
    setIsBusy(true);
    setFormError(null);
    setFieldErrors({});

    const payload: CreateTransactionRequest = {
      merchant,
      amount,
      type,
      category,
      timestamp: new Date(occurredAt).toISOString(),
      ...(note.trim() ? { note: note.trim() } : {}),
    };

    try {
      await api.createTransaction({ token, workspaceId: activeWorkspace?.id ?? null }, payload);
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
        setFormError('Could not save this transaction. Try again');
      }
    } finally {
      setIsBusy(false);
    }
  }, [merchant, amount, type, category, occurredAt, note, token, activeWorkspace, reset, onCreated, onClose]);

  if (!isOpen) return null;

  const accent = type === 'expense' ? 'var(--outflow)' : 'var(--inflow)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] overflow-y-auto"
      style={{ background: 'color-mix(in srgb, #000 62%, transparent)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-transaction-title"
    >
      <div className="panel w-full max-w-md" style={{ background: 'var(--surface)' }}>
        <header
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--rule)' }}
        >
          <div>
            <h2 id="add-transaction-title" className="display text-[15px] font-semibold">
              New transaction
            </h2>
            <p className="eyebrow mt-0.5">
              {activeWorkspace?.name ?? '—'} · {activeWorkspace?.baseCurrency ?? '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ color: 'var(--graphite)' }}
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-4 space-y-4">
          <div
            className="grid grid-cols-2 rounded border overflow-hidden"
            style={{ borderColor: 'var(--rule)' }}
            role="group"
            aria-label="Transaction direction"
          >
            {(['expense', 'income'] as const).map((option) => {
              const isActive = type === option;
              const color = option === 'expense' ? 'var(--outflow)' : 'var(--inflow)';
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => changeType(option)}
                  aria-pressed={isActive}
                  className="py-2 text-[12.5px] font-medium capitalize transition-colors"
                  style={{
                    background: isActive ? `color-mix(in srgb, ${color} 14%, transparent)` : 'transparent',
                    color: isActive ? color : 'var(--graphite)',
                  }}
                >
                  {option === 'expense' ? '− Expense' : '+ Income'}
                </button>
              );
            })}
          </div>

          <Field label="Name" error={fieldErrors.merchant}>
            <input
              ref={firstFieldRef}
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
              placeholder={type === 'expense' ? 'Silpo, rent, taxi…' : 'Salary, client invoice…'}
              maxLength={120}
              className="w-full rounded border bg-transparent px-2.5 py-2 text-[13px] outline-none"
              style={{
                borderColor: fieldErrors.merchant ? 'var(--outflow)' : 'var(--rule)',
                color: 'var(--parchment)',
              }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" error={fieldErrors.amount}>
              <div className="relative">
                <span
                  className="figure absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px]"
                  style={{ color: accent }}
                  aria-hidden="true"
                >
                  {type === 'expense' ? '−' : '+'}
                </span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !isBusy) void submit();
                  }}
                  className="figure w-full rounded border bg-transparent pl-6 pr-2.5 py-2 text-[14px] outline-none"
                  style={{
                    borderColor: fieldErrors.amount ? 'var(--outflow)' : 'var(--rule)',
                    color: accent,
                  }}
                />
              </div>
            </Field>

            <Field label="Category">
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as Category)}
                className="w-full rounded border px-2.5 py-2 text-[13px] outline-none"
                style={{
                  borderColor: 'var(--rule)',
                  color: 'var(--parchment)',
                  background: 'var(--surface-raised)',
                }}
              >
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="When" error={fieldErrors.timestamp}>
            <input
              type="datetime-local"
              value={occurredAt}
              max={todayLocal()}
              onChange={(event) => setOccurredAt(event.target.value)}
              className="figure w-full rounded border bg-transparent px-2.5 py-2 text-[12.5px] outline-none"
              style={{
                borderColor: fieldErrors.timestamp ? 'var(--outflow)' : 'var(--rule)',
                color: 'var(--parchment)',
                colorScheme: 'dark',
              }}
            />
          </Field>

          <Field label="Note" hint="optional">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What was this for?"
              maxLength={200}
              className="w-full rounded border bg-transparent px-2.5 py-2 text-[13px] outline-none"
              style={{ borderColor: 'var(--rule)', color: 'var(--parchment)' }}
            />
          </Field>

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
            disabled={isBusy || merchant.trim() === '' || amount.trim() === ''}
            className="flex items-center gap-2 rounded px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-40"
            style={{ background: 'var(--gold)', color: 'var(--ink)' }}
          >
            {isBusy && <Loader2 size={13} className="animate-spin" />}
            Save transaction
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: JSX.Element;
}): JSX.Element {
  return (
    <label className="block">
      <span className="eyebrow flex items-center gap-1.5">
        {label}
        {hint && <span style={{ opacity: 0.6 }}>· {hint}</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {error && (
        <span className="mt-1 block text-[11.5px]" style={{ color: 'var(--outflow)' }}>
          {error}
        </span>
      )}
    </label>
  );
}
