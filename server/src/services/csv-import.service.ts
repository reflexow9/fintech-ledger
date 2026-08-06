import { randomUUID } from 'node:crypto';
import type {
  Category,
  CurrencyCode,
  ImportCsvRequest,
  ImportCsvResult,
  ImportRowIssue,
  ImportableField,
  SchemaMapping,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '@fintech/shared';
import {
  isCategory,
  isCurrencyCode,
  isTransactionStatus,
  isTransactionType,
  money,
} from '@fintech/shared';

const MAX_ROWS = 50_000;
const PREVIEW_LIMIT = 25;
const REQUIRED_FIELDS: readonly ImportableField[] = ['timestamp', 'merchant', 'amount'];

export function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t', '|'] as const;
  let best = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = headerLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(raw: string): { header: string[]; rows: string[][] } {
  const text = raw.replace(/^\uFEFF/, '');
  const firstBreak = text.indexOf('\n');
  const delimiter = detectDelimiter(firstBreak === -1 ? text : text.slice(0, firstBreak));

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  const pushField = (): void => {
    row.push(field.trim());
    field = '';
  };
  const pushRow = (): void => {
    if (row.length > 1 || (row[0] ?? '') !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === delimiter) pushField();
    else if (char === '\n') {
      pushField();
      pushRow();
    } else if (char !== '\r') field += char ?? '';
  }
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  const header = rows.shift() ?? [];
  return { header, rows };
}

export interface Coerced<T> {
  readonly value: T | null;
  readonly warning?: string;
}

export function parseAmount(rawInput: string): Coerced<{ minorUnits: number; negative: boolean }> {
  const raw = rawInput.trim();
  if (raw === '') return { value: null };

  const parenthesised = /^\((.*)\)$/.exec(raw);
  const body = parenthesised?.[1] ?? raw;
  const negative = parenthesised !== null || /^-/.test(body) || /-$/.test(body);

  let cleaned = body.replace(/[^\d.,]/g, '');
  if (cleaned === '') return { value: null };

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }

  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return { value: null };

  const minorUnits = Math.round(Math.abs(parsed) * 100);
  const warning =
    (cleaned.split('.')[1]?.length ?? 0) > 2
      ? 'More than two decimal places; rounded to the nearest cent'
      : undefined;

  return warning === undefined
    ? { value: { minorUnits, negative } }
    : { value: { minorUnits, negative }, warning };
}

export function parseTimestamp(rawInput: string): Coerced<string> {
  const raw = rawInput.trim();
  if (raw === '') return { value: null };

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(raw);
  if (iso) return { value: buildUtc(iso[1], iso[2], iso[3], iso[4], iso[5]) };

  const slashed = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(raw);
  if (slashed) {
    const first = Number(slashed[1]);
    const second = Number(slashed[2]);
    const dayFirst = first > 12 || second <= 12;
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    if (month < 1 || month > 12 || day < 1 || day > 31) return { value: null };
    const value = buildUtc(slashed[3], String(month), String(day));
    return first <= 12 && second <= 12
      ? { value, warning: 'Ambiguous date; read as day/month/year' }
      : { value };
  }

  return { value: null };
}

function buildUtc(
  year: string | undefined,
  month: string | undefined,
  day: string | undefined,
  hour = '00',
  minute = '00',
): string | null {
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function inferType(rawType: string | null, amountWasNegative: boolean): TransactionType {
  const normalised = (rawType ?? '').trim().toLowerCase();
  if (isTransactionType(normalised)) return normalised;
  if (['credit', 'deposit', 'in', 'inflow'].includes(normalised)) return 'income';
  if (['debit', 'withdrawal', 'out', 'outflow'].includes(normalised)) return 'expense';
  return amountWasNegative ? 'expense' : 'income';
}

interface ColumnIndex {
  readonly resolve: (field: ImportableField) => string | null;
}

function buildColumnIndex(header: readonly string[], mapping: SchemaMapping, row: readonly string[]): ColumnIndex {
  const normalise = (value: string): string => value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const positions = new Map<string, number>();
  header.forEach((name, index) => positions.set(normalise(name), index));

  return {
    resolve: (field) => {
      const column = mapping[field];
      if (column === null || column === undefined) return null;
      const index = positions.get(normalise(column));
      if (index === undefined) return null;
      return row[index] ?? null;
    },
  };
}

export interface ImportContext {
  readonly workspaceId: string;
  readonly baseCurrency: CurrencyCode;
  readonly now?: Date;
}

export interface ImportOutcome {
  readonly result: ImportCsvResult;
  readonly accepted: readonly Transaction[];
}

export function validateAndBuild(
  request: ImportCsvRequest,
  context: ImportContext,
): ImportOutcome {
  const now = context.now ?? new Date();
  const batchId = randomUUID();
  const { header, rows } = parseCsv(request.csv);
  const issues: ImportRowIssue[] = [];
  const accepted: Transaction[] = [];
  const fingerprints = new Set<string>();

  const truncated = rows.slice(0, MAX_ROWS);

  truncated.forEach((row, rowIndex) => {
    const line = rowIndex + 2;
    const rowIssues: ImportRowIssue[] = [];
    const index = buildColumnIndex(header, request.mapping, row);

    const issue = (
      field: ImportableField | null,
      code: ImportRowIssue['code'],
      message: string,
      rawValue: string | null,
      severity: ImportRowIssue['severity'] = 'error',
    ): void => {
      rowIssues.push({ line, field, code, message, rawValue, severity });
    };

    if (row.length !== header.length) {
      issue(
        null,
        'COLUMN_COUNT_MISMATCH',
        `Expected ${header.length} columns, found ${row.length}`,
        null,
        row.length > header.length ? 'warning' : 'error',
      );
    }

    for (const field of REQUIRED_FIELDS) {
      const value = index.resolve(field);
      if (value === null || value.trim() === '') {
        issue(field, 'REQUIRED_FIELD_MISSING', `${field} is required`, value);
      }
    }

    const rawAmount = index.resolve('amount') ?? '';
    const amount = parseAmount(rawAmount);
    if (rawAmount.trim() !== '' && amount.value === null) {
      issue('amount', 'UNPARSABLE_AMOUNT', `Cannot read "${rawAmount}" as an amount`, rawAmount);
    } else if (amount.warning) {
      issue('amount', 'UNPARSABLE_AMOUNT', amount.warning, rawAmount, 'warning');
    }

    const rawTimestamp = index.resolve('timestamp') ?? '';
    const timestamp = parseTimestamp(rawTimestamp);
    if (rawTimestamp.trim() !== '' && timestamp.value === null) {
      issue(
        'timestamp',
        'UNPARSABLE_DATE',
        `Cannot read "${rawTimestamp}" as a date. Use YYYY-MM-DD`,
        rawTimestamp,
      );
    } else if (timestamp.warning) {
      issue('timestamp', 'UNPARSABLE_DATE', timestamp.warning, rawTimestamp, 'warning');
    } else if (timestamp.value !== null && new Date(timestamp.value) > now) {
      issue('timestamp', 'FUTURE_DATE', 'Date is in the future', rawTimestamp);
    }

    const rawCurrency = (index.resolve('currency') ?? request.defaults?.currency ?? context.baseCurrency)
      .toString()
      .trim()
      .toUpperCase();
    if (!isCurrencyCode(rawCurrency)) {
      issue('currency', 'UNSUPPORTED_CURRENCY', `${rawCurrency} is not supported`, rawCurrency);
    }

    const rawCategory = (index.resolve('category') ?? request.defaults?.category ?? 'other')
      .toString()
      .trim()
      .toLowerCase();
    const category: Category = isCategory(rawCategory) ? rawCategory : 'other';
    if (!isCategory(rawCategory)) {
      issue(
        'category',
        'UNKNOWN_ENUM_VALUE',
        `Unknown category "${rawCategory}", filed under "other"`,
        rawCategory,
        'warning',
      );
    }

    const rawStatus = (index.resolve('status') ?? request.defaults?.status ?? 'completed')
      .toString()
      .trim()
      .toLowerCase();
    const status: TransactionStatus = isTransactionStatus(rawStatus) ? rawStatus : 'completed';
    if (!isTransactionStatus(rawStatus)) {
      issue(
        'status',
        'UNKNOWN_ENUM_VALUE',
        `Unknown status "${rawStatus}", treated as completed`,
        rawStatus,
        'warning',
      );
    }

    const merchant = (index.resolve('merchant') ?? '').trim();
    const type = inferType(index.resolve('type'), amount.value?.negative ?? false);

    const blocking = rowIssues.some((i) => i.severity === 'error');
    if (!blocking && amount.value && timestamp.value && isCurrencyCode(rawCurrency)) {
      const fingerprint = `${timestamp.value.slice(0, 10)}|${merchant.toLowerCase()}|${amount.value.minorUnits}|${type}`;
      if (fingerprints.has(fingerprint)) {
        issue(
          null,
          'DUPLICATE_ROW',
          'Identical date, merchant and amount already in this file',
          merchant,
          'warning',
        );
      }
      fingerprints.add(fingerprint);

      const note = index.resolve('note')?.trim();
      accepted.push({
        id: randomUUID(),
        workspaceId: context.workspaceId,
        amount: money(amount.value.minorUnits, rawCurrency),
        type,
        status,
        category,
        merchant,
        timestamp: timestamp.value,
        importBatchId: batchId,
        ...(note ? { note } : {}),
      });
    }

    issues.push(...rowIssues);
  });

  return {
    result: {
      batchId,
      dryRun: request.dryRun ?? false,
      totalRows: truncated.length,
      acceptedRows: accepted.length,
      rejectedRows: truncated.length - accepted.length,
      issues,
      preview: accepted.slice(0, PREVIEW_LIMIT),
    },
    accepted,
  };
}
