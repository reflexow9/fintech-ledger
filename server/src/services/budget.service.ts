import type { Budget, BudgetPeriod, Transaction } from '@fintech/shared';
import { money } from '@fintech/shared';
import type { BudgetLimit } from '../data/transaction.repository';

const MS_PER_DAY = 86_400_000;

interface PeriodWindow {
  readonly from: Date;
  readonly to: Date;
}

function resolvePeriodWindow(period: BudgetPeriod, now: Date): PeriodWindow {
  if (period === 'weekly') {
    const mondayOffset = (now.getUTCDay() + 6) % 7;
    const from = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset),
    );
    return { from, to: new Date(from.getTime() + 7 * MS_PER_DAY) };
  }

  if (period === 'quarterly') {
    const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    const from = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth + 3, 1));
    return { from, to };
  }

  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from, to };
}

function spentInWindow(
  transactions: readonly Transaction[],
  category: BudgetLimit['category'],
  window: PeriodWindow,
): number {
  return transactions
    .filter((tx) => tx.category === category && tx.type === 'expense' && tx.status === 'completed')
    .filter((tx) => {
      const at = new Date(tx.timestamp).getTime();
      return at >= window.from.getTime() && at < window.to.getTime();
    })
    .reduce((acc, tx) => acc + tx.amount.minorUnits, 0);
}

export function buildBudgets(
  limits: readonly BudgetLimit[],
  transactions: readonly Transaction[],
  now: Date = new Date(),
): Budget[] {
  return limits.map((limit): Budget => {
    const window = resolvePeriodWindow(limit.period, now);
    const spentMinor = spentInWindow(transactions, limit.category, window);
    const total = window.to.getTime() - window.from.getTime();
    const elapsed = now.getTime() - window.from.getTime();
    const periodProgress = total <= 0 ? 0 : Math.min(1, Math.max(0, elapsed / total));

    return {
      id: limit.id,
      workspaceId: limit.workspaceId,
      category: limit.category,
      limit: limit.limit,
      spent: money(spentMinor, limit.limit.currency),
      period: limit.period,
      periodProgress,
    };
  });
}
