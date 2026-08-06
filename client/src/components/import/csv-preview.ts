import type { ImportableField, SchemaMapping } from '@fintech/shared';
import { IMPORTABLE_FIELDS } from '@fintech/shared';

const PREVIEW_ROWS = 8;

export interface CsvPreview {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly totalRows: number;
  readonly delimiter: string;
}

export function previewCsv(text: string): CsvPreview {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.slice(0, clean.indexOf('\n') === -1 ? clean.length : clean.indexOf('\n'));
  const delimiter =
    [',', ';', '\t', '|']
      .map((candidate) => ({ candidate, count: firstLine.split(candidate).length - 1 }))
      .sort((a, b) => b.count - a.count)[0]?.candidate ?? ',';

  const lines = clean.split(/\r?\n/).filter((line) => line.trim() !== '');
  const splitLine = (line: string): string[] => {
    const cells: string[] = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        cells.push(cell.trim());
        cell = '';
      } else cell += char ?? '';
    }
    cells.push(cell.trim());
    return cells;
  };

  const header = lines.length > 0 ? splitLine(lines[0] ?? '') : [];
  const rows = lines.slice(1, PREVIEW_ROWS + 1).map(splitLine);

  return { header, rows, totalRows: Math.max(0, lines.length - 1), delimiter };
}

const SYNONYMS: Readonly<Record<ImportableField, readonly string[]>> = {
  timestamp: ['transactiondate', 'bookingdate', 'valuedate', 'postedon', 'date', 'datetime', 'when'],
  merchant: ['merchant', 'description', 'payee', 'counterparty', 'name', 'details', 'narrative'],
  amount: ['amount', 'value', 'debitcredit', 'sum', 'total', 'transactionamount'],
  currency: ['currency', 'ccy', 'curr', 'isocurrency'],
  type: ['type', 'direction', 'debitcredit', 'drcr', 'transactiontype'],
  category: ['category', 'class', 'expensetype', 'costcentre', 'costcenter'],
  status: ['status', 'state', 'cleared', 'settlementstatus'],
  note: ['note', 'memo', 'reference', 'comment', 'remarks'],
};

const normalise = (value: string): string => value.toLowerCase().replace(/[\s_\-/.]+/g, '');

export function autoMap(header: readonly string[]): SchemaMapping {
  const claimed = new Set<string>();
  const entries = IMPORTABLE_FIELDS.map((field): [ImportableField, string | null] => {
    const synonyms = SYNONYMS[field];
    for (const synonym of synonyms) {
      const match = header.find(
        (column) => !claimed.has(column) && normalise(column) === synonym,
      );
      if (match) {
        claimed.add(match);
        return [field, match];
      }
    }
    for (const synonym of synonyms) {
      const match = header.find(
        (column) => !claimed.has(column) && normalise(column).includes(synonym),
      );
      if (match) {
        claimed.add(match);
        return [field, match];
      }
    }
    return [field, null];
  });

  return Object.fromEntries(entries) as SchemaMapping;
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error("Couldn't read that file. Try re-exporting it as CSV"));
    reader.readAsText(file, 'utf-8');
  });
}
