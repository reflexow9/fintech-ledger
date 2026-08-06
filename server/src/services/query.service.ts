import type {
  Page,
  SortDirection,
  Transaction,
  TransactionQuery,
  TransactionSortField,
} from '@fintech/shared';
import { TRANSACTION_SORT_FIELDS } from '@fintech/shared';

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 25;
const MATCH_THRESHOLD = 0.42;

export function levenshtein(a: string, b: string, maxDistance = 4): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = (current[j - 1] ?? 0) + 1;
      const deletion = (previous[j] ?? 0) + 1;
      const best = Math.min(substitution, insertion, deletion);
      current[j] = best;
      rowMin = Math.min(rowMin, best);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[b.length] ?? maxDistance + 1;
}

export function isSubsequence(needle: string, haystack: string): boolean {
  let cursor = 0;
  for (const char of haystack) {
    if (char === needle[cursor]) cursor += 1;
    if (cursor === needle.length) return true;
  }
  return cursor === needle.length;
}

export function fuzzyScore(query: string, target: string): number {
  const q = query.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (q === '') return 1;
  if (t === '') return 0;

  if (t === q) return 1;
  if (t.startsWith(q)) return 0.95;
  if (t.includes(q)) return 0.85;

  const words = t.split(/[\s\-_/]+/);
  if (words.some((word) => word.startsWith(q))) return 0.8;

  if (isSubsequence(q, t)) return 0.65;

  const distance = levenshtein(q, t, Math.max(2, Math.floor(q.length / 2)));
  const normalised = 1 - distance / Math.max(q.length, t.length);
  return normalised > 0 ? normalised * 0.7 : 0;
}

export function scoreTransaction(query: string, tx: Transaction): number {
  return Math.max(
    fuzzyScore(query, tx.merchant),
    fuzzyScore(query, tx.category) * 0.9,
    tx.note ? fuzzyScore(query, tx.note) * 0.75 : 0,
  );
}

type RawQuery = Readonly<Record<string, unknown>>;

const readString = (raw: RawQuery, key: string): string | undefined => {
  const value = raw[key];
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return undefined;
};

const readNumber = (raw: RawQuery, key: string): number | undefined => {
  const value = readString(raw, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const isSortField = (value: string): value is TransactionSortField =>
  (TRANSACTION_SORT_FIELDS as readonly string[]).includes(value);

export function parseTransactionQuery(raw: RawQuery): TransactionQuery {
  const sortBy = readString(raw, 'sortBy');
  const sortDir = readString(raw, 'sortDir');
  const categories = readString(raw, 'categories')
    ?.split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  const query: Record<string, unknown> = {
    page: Math.max(1, Math.floor(readNumber(raw, 'page') ?? 1)),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(readNumber(raw, 'pageSize') ?? DEFAULT_PAGE_SIZE))),
    sortBy: sortBy && isSortField(sortBy) ? sortBy : 'timestamp',
    sortDir: sortDir === 'asc' ? 'asc' : ('desc' satisfies SortDirection),
  };

  const optional: Array<[string, unknown]> = [
    ['search', readString(raw, 'search')],
    ['type', readString(raw, 'type')],
    ['status', readString(raw, 'status')],
    ['from', readString(raw, 'from')],
    ['to', readString(raw, 'to')],
    ['minAmount', readNumber(raw, 'minAmount')],
    ['maxAmount', readNumber(raw, 'maxAmount')],
    ['categories', categories?.length ? categories : undefined],
  ];
  for (const [key, value] of optional) {
    if (value !== undefined) query[key] = value;
  }

  return query as TransactionQuery;
}

export function queryTransactions(
  source: readonly Transaction[],
  query: TransactionQuery,
): Page<Transaction> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

  const filtered = source.filter((tx) => {
    if (query.type && tx.type !== query.type) return false;
    if (query.status && tx.status !== query.status) return false;
    if (query.categories?.length && !query.categories.includes(tx.category)) return false;
    if (query.from && tx.timestamp < query.from) return false;
    if (query.to && tx.timestamp > query.to) return false;

    const major = tx.amount.minorUnits / 100;
    if (query.minAmount !== undefined && major < query.minAmount) return false;
    if (query.maxAmount !== undefined && major > query.maxAmount) return false;
    return true;
  });

  const searchTerm = query.search;
  const scored = searchTerm
    ? filtered
        .map((tx) => ({ tx, score: scoreTransaction(searchTerm, tx) }))
        .filter((entry) => entry.score >= MATCH_THRESHOLD)
    : filtered.map((tx) => ({ tx, score: 1 }));

  const direction = query.sortDir === 'asc' ? 1 : -1;
  const sortBy = query.sortBy ?? 'timestamp';

  scored.sort((a, b) => {
    if (searchTerm && a.score !== b.score) return b.score - a.score;
    switch (sortBy) {
      case 'amount':
        return (a.tx.amount.minorUnits - b.tx.amount.minorUnits) * direction;
      case 'merchant':
        return a.tx.merchant.localeCompare(b.tx.merchant) * direction;
      case 'category':
        return a.tx.category.localeCompare(b.tx.category) * direction;
      case 'timestamp':
      default:
        return a.tx.timestamp.localeCompare(b.tx.timestamp) * direction;
    }
  });

  const total = scored.length;
  const start = (page - 1) * pageSize;

  return {
    items: scored.slice(start, start + pageSize).map((entry) => entry.tx),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
