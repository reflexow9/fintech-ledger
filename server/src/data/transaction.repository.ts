import type {
  BudgetPeriod,
  Category,
  CurrencyCode,
  Money,
  Transaction,
  TransactionStatus,
  TransactionType,
  Workspace,
} from "@fintech/shared";
import { money } from "@fintech/shared";
import { randomUUID } from "node:crypto";

export interface BudgetLimit {
  readonly id: string;
  readonly workspaceId: string;
  readonly category: Category;
  readonly limit: Money;
  readonly period: BudgetPeriod;
}

export interface TransactionRepository {
  listByWorkspace(workspaceId: string): readonly Transaction[];
  insertMany(transactions: readonly Transaction[]): number;
  findWorkspace(workspaceId: string): Workspace | undefined;
  listWorkspaces(): readonly Workspace[];

  listBudgets(workspaceId: string): readonly BudgetLimit[];

  upsertBudget(input: Omit<BudgetLimit, "id">): BudgetLimit;
  deleteBudget(workspaceId: string, budgetId: string): boolean;
}

export const WORKSPACES: readonly Workspace[] = [
  {
    id: "ws_personal",
    name: "Personal",
    kind: "personal",
    baseCurrency: "USD",
  },
  {
    id: "ws_business",
    name: "Northwind Studio",
    kind: "business",
    baseCurrency: "USD",
  },
];

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface MerchantProfile {
  readonly merchant: string;
  readonly category: Category;
  readonly typicalMinor: number;
  readonly variance: number;
  readonly frequency: number;
}

const PERSONAL_PROFILE: readonly MerchantProfile[] = [
  {
    merchant: "Silpo Market",
    category: "groceries",
    typicalMinor: 6400,
    variance: 0.45,
    frequency: 9,
  },
  {
    merchant: "Uklon",
    category: "transport",
    typicalMinor: 1850,
    variance: 0.5,
    frequency: 11,
  },
  {
    merchant: "Aroma Kava",
    category: "dining",
    typicalMinor: 950,
    variance: 0.35,
    frequency: 14,
  },
  {
    merchant: "Kyivstar",
    category: "utilities",
    typicalMinor: 3200,
    variance: 0.08,
    frequency: 1,
  },
  {
    merchant: "Rozetka",
    category: "other",
    typicalMinor: 12400,
    variance: 0.9,
    frequency: 3,
  },
  {
    merchant: "Spotify",
    category: "software",
    typicalMinor: 1099,
    variance: 0,
    frequency: 1,
  },
  {
    merchant: "Apartment Rent",
    category: "housing",
    typicalMinor: 145000,
    variance: 0,
    frequency: 1,
  },
  {
    merchant: "Medikom Clinic",
    category: "healthcare",
    typicalMinor: 42000,
    variance: 0.6,
    frequency: 0.5,
  },
];

const BUSINESS_PROFILE: readonly MerchantProfile[] = [
  {
    merchant: "AWS",
    category: "software",
    typicalMinor: 184000,
    variance: 0.22,
    frequency: 1,
  },
  {
    merchant: "Figma",
    category: "software",
    typicalMinor: 4500,
    variance: 0,
    frequency: 1,
  },
  {
    merchant: "Contractor Payroll",
    category: "payroll",
    typicalMinor: 890000,
    variance: 0.12,
    frequency: 2,
  },
  {
    merchant: "LinkedIn Ads",
    category: "marketing",
    typicalMinor: 156000,
    variance: 0.55,
    frequency: 4,
  },
  {
    merchant: "WeWork Podil",
    category: "housing",
    typicalMinor: 320000,
    variance: 0,
    frequency: 1,
  },
  {
    merchant: "Ryanair",
    category: "travel",
    typicalMinor: 78000,
    variance: 0.7,
    frequency: 1.5,
  },
  {
    merchant: "Notion",
    category: "software",
    typicalMinor: 9600,
    variance: 0,
    frequency: 1,
  },
];

const INCOME_SOURCES: Readonly<Record<string, MerchantProfile>> = {
  ws_personal: {
    merchant: "Salary — Northwind",
    category: "revenue",
    typicalMinor: 520000,
    variance: 0.03,
    frequency: 2,
  },
  ws_business: {
    merchant: "Client Invoice",
    category: "revenue",
    typicalMinor: 1450000,
    variance: 0.35,
    frequency: 6,
  },
};

const MS_PER_DAY = 86_400_000;

function seedWorkspace(
  workspace: Workspace,
  days: number,
  now: Date,
): Transaction[] {
  const random = createRandom(
    workspace.id === "ws_personal" ? 20250401 : 20250815,
  );
  const profiles =
    workspace.kind === "personal" ? PERSONAL_PROFILE : BUSINESS_PROFILE;
  const incomeProfile = INCOME_SOURCES[workspace.id];
  const rows: Transaction[] = [];

  for (let dayOffset = days; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date(now.getTime() - dayOffset * MS_PER_DAY);

    const weekday = date.getUTCDay();

    const weekendFactor =
      workspace.kind === "personal"
        ? weekday === 0 || weekday === 6
          ? 1.45
          : 0.92
        : weekday === 0 || weekday === 6
          ? 0.25
          : 1.1;

    const driftFactor = 1 + ((days - dayOffset) / days) * 0.18;

    for (const profile of profiles) {
      const probability = (profile.frequency / 30) * weekendFactor;
      if (random() > probability) continue;

      const jitter = 1 + (random() - 0.5) * 2 * profile.variance;
      const minorUnits = Math.round(
        profile.typicalMinor * jitter * driftFactor,
      );
      rows.push(
        makeTransaction(workspace, {
          merchant: profile.merchant,
          category: profile.category,
          minorUnits,
          date,
          type: "expense",
          status: dayOffset < 2 && random() < 0.4 ? "pending" : "completed",
          currency: workspace.baseCurrency,
        }),
      );
    }

    if (incomeProfile && random() < incomeProfile.frequency / 30) {
      const jitter = 1 + (random() - 0.5) * 2 * incomeProfile.variance;
      rows.push(
        makeTransaction(workspace, {
          merchant: incomeProfile.merchant,
          category: "revenue",
          minorUnits: Math.round(incomeProfile.typicalMinor * jitter),
          date,
          type: "income",
          status: "completed",
          currency: workspace.baseCurrency,
        }),
      );
    }
  }

  return rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function makeTransaction(
  workspace: Workspace,
  input: {
    merchant: string;
    category: Category;
    minorUnits: number;
    date: Date;
    type: TransactionType;
    status: TransactionStatus;
    currency: CurrencyCode;
  },
): Transaction {
  return {
    id: randomUUID(),
    workspaceId: workspace.id,
    amount: money(input.minorUnits, input.currency),
    type: input.type,
    status: input.status,
    category: input.category,
    merchant: input.merchant,
    timestamp: input.date.toISOString(),
  };
}

export function createInMemoryRepository(
  now: Date = new Date(),
): TransactionRepository {
  const store = new Map<string, Transaction[]>();
  for (const workspace of WORKSPACES) {
    store.set(workspace.id, seedWorkspace(workspace, 180, now));
  }
  const budgetStore = new Map<string, BudgetLimit[]>();

  return {
    listByWorkspace: (workspaceId) => store.get(workspaceId) ?? [],

    insertMany: (transactions) => {
      let inserted = 0;
      for (const tx of transactions) {
        const bucket = store.get(tx.workspaceId);
        if (!bucket) continue;
        bucket.push(tx);
        inserted += 1;
      }
      for (const bucket of store.values()) {
        bucket.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      }
      return inserted;
    },

    findWorkspace: (workspaceId) =>
      WORKSPACES.find((w) => w.id === workspaceId),
    listWorkspaces: () => WORKSPACES,

    listBudgets: (workspaceId) => budgetStore.get(workspaceId) ?? [],

    upsertBudget: (input) => {
      const bucket = budgetStore.get(input.workspaceId) ?? [];
      const existingIndex = bucket.findIndex(
        (b) => b.category === input.category,
      );
      const record: BudgetLimit = {
        id: existingIndex >= 0 ? bucket[existingIndex]!.id : randomUUID(),
        ...input,
      };
      if (existingIndex >= 0) bucket[existingIndex] = record;
      else bucket.push(record);
      budgetStore.set(input.workspaceId, bucket);
      return record;
    },

    deleteBudget: (workspaceId, budgetId) => {
      const bucket = budgetStore.get(workspaceId);
      if (!bucket) return false;
      const index = bucket.findIndex((b) => b.id === budgetId);
      if (index < 0) return false;
      bucket.splice(index, 1);
      return true;
    },
  };
}
