import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Check, FileUp, Loader2, X } from "lucide-react";
import type {
  ImportCsvResult,
  ImportRowIssue,
  ImportableField,
  SchemaMapping,
} from "@fintech/shared";
import { IMPORTABLE_FIELDS } from "@fintech/shared";
import { api, ApiClientError } from "../../lib/api-client";
import { useAuth } from "../../context/AuthContext";
import { formatMoney, formatDate } from "../../lib/format";
import {
  autoMap,
  previewCsv,
  readFileText,
  type CsvPreview,
} from "./csv-preview";

type Step = 1 | 2 | 3;

const REQUIRED_FIELDS: readonly ImportableField[] = [
  "timestamp",
  "merchant",
  "amount",
];
const STEP_LABELS: Readonly<Record<Step, string>> = {
  1: "Upload file",
  2: "Match columns",
  3: "Review and import",
};

export function ImportWizard({
  onImported,
}: {
  onImported: () => void;
}): JSX.Element {
  const { token, activeWorkspace } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string>("");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<SchemaMapping | null>(null);
  const [report, setReport] = useState<ImportCsvResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo(
    () => ({ token, workspaceId: activeWorkspace?.id ?? null }),
    [token, activeWorkspace],
  );

  const acceptFile = useCallback(async (file: File): Promise<void> => {
    setError(null);
    if (!/\.(csv|txt|tsv)$/i.test(file.name)) {
      setError(
        "That file type isn\u2019t supported. Export your statement as CSV and try again",
      );
      return;
    }
    setIsBusy(true);
    try {
      const text = await readFileText(file);
      const parsed = previewCsv(text);
      if (parsed.header.length < 2) {
        setError(
          "This file has no readable columns. Check it opens correctly in a spreadsheet",
        );
        return;
      }
      setFileName(file.name);
      setCsvText(text);
      setPreview(parsed);
      setMapping(autoMap(parsed.header));
      setStep(2);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not read that file",
      );
    } finally {
      setIsBusy(false);
    }
  }, []);

  const runValidation = useCallback(async (): Promise<void> => {
    if (!mapping) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = await api.importCsv(context, {
        csv: csvText,
        mapping,
        dryRun: true,
      });
      setReport(result);
      setStep(3);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "Validation failed",
      );
    } finally {
      setIsBusy(false);
    }
  }, [context, csvText, mapping]);

  const commit = useCallback(async (): Promise<void> => {
    if (!mapping) return;
    setIsBusy(true);
    setError(null);
    try {
      await api.importCsv(context, { csv: csvText, mapping, dryRun: false });
      onImported();
      reset();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "Import failed",
      );
    } finally {
      setIsBusy(false);
    }
  }, [context, csvText, mapping, onImported]);

  const reset = (): void => {
    setStep(1);
    setFileName(null);
    setCsvText("");
    setPreview(null);
    setMapping(null);
    setReport(null);
  };

  const missingRequired = mapping
    ? REQUIRED_FIELDS.filter((field) => !mapping[field])
    : REQUIRED_FIELDS;

  return (
    <section className="panel" aria-label="Import transactions from CSV">
      <header
        className="px-4 py-3 border-b"
        style={{ borderColor: "var(--rule)" }}
      >
        <h2 className="display text-[15px] font-semibold">
          Import transactions
        </h2>
        <StepRail current={step} />
      </header>

      {error && (
        <div
          className="mx-4 mt-4 flex items-start gap-2 rounded border px-3 py-2 text-[12.5px]"
          style={{ borderColor: "var(--outflow)", color: "var(--outflow)" }}
          role="alert"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="p-4">
        {step === 1 && <DropZone isBusy={isBusy} onFile={acceptFile} />}

        {step === 2 && preview && mapping && (
          <MappingStep
            preview={preview}
            mapping={mapping}
            fileName={fileName ?? "statement.csv"}
            missingRequired={missingRequired}
            isBusy={isBusy}
            onChange={(field, column) =>
              setMapping({ ...mapping, [field]: column })
            }
            onBack={reset}
            onContinue={runValidation}
          />
        )}

        {step === 3 && report && (
          <ReviewStep
            report={report}
            isBusy={isBusy}
            onBack={() => setStep(2)}
            onCommit={commit}
          />
        )}
      </div>
    </section>
  );
}

function StepRail({ current }: { current: Step }): JSX.Element {
  return (
    <ol className="mt-2.5 flex items-center gap-4" aria-label="Import progress">
      {([1, 2, 3] as const).map((step) => {
        const state =
          step < current ? "done" : step === current ? "active" : "todo";
        return (
          <li key={step} className="flex items-center gap-1.5">
            <span
              className="figure flex h-4 w-4 items-center justify-center rounded-full text-[9px]"
              style={{
                background: state === "done" ? "var(--gold)" : "transparent",
                border: `1px solid ${state === "todo" ? "var(--rule)" : "var(--gold)"}`,
                color: state === "done" ? "var(--ink)" : "var(--gold)",
              }}
              aria-hidden="true"
            >
              {state === "done" ? <Check size={9} strokeWidth={3} /> : step}
            </span>
            <span
              className="eyebrow"
              style={{
                color:
                  state === "active" ? "var(--parchment)" : "var(--graphite)",
              }}
              aria-current={state === "active" ? "step" : undefined}
            >
              {STEP_LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function DropZone({
  isBusy,
  onFile,
}: {
  isBusy: boolean;
  onFile: (file: File) => Promise<void>;
}): JSX.Element {
  const [isOver, setIsOver] = useState(false);

  return (
    <div>
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsOver(false);
          const file = event.dataTransfer.files[0];
          if (file) void onFile(file);
        }}
        className="flex flex-col items-center justify-center gap-2 rounded border border-dashed py-14 cursor-pointer transition-colors"
        style={{
          borderColor: isOver ? "var(--gold)" : "var(--rule)",
          background: isOver
            ? "color-mix(in srgb, var(--gold) 6%, transparent)"
            : "transparent",
        }}
      >
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
        {isBusy ? (
          <Loader2
            size={20}
            className="animate-spin"
            style={{ color: "var(--gold)" }}
          />
        ) : (
          <FileUp
            size={20}
            style={{ color: "var(--graphite)" }}
            strokeWidth={1.5}
          />
        )}
        <span className="text-[13px]" style={{ color: "var(--parchment)" }}>
          Drop a CSV statement, or click to choose one
        </span>
        <span className="eyebrow">csv · tsv · up to 8 MB</span>
      </label>

      <p className="mt-3 text-[12px]" style={{ color: "var(--graphite)" }}>
        Commas or semicolons, quoted fields, and both{" "}
        <span className="figure">1,234.56</span> and{" "}
        <span className="figure">1.234,56</span> amounts are read correctly.
        Column names are matched automatically — you can adjust them in the next
        step.
      </p>
    </div>
  );
}

function MappingStep({
  preview,
  mapping,
  fileName,
  missingRequired,
  isBusy,
  onChange,
  onBack,
  onContinue,
}: {
  preview: CsvPreview;
  mapping: SchemaMapping;
  fileName: string;
  missingRequired: readonly ImportableField[];
  isBusy: boolean;
  onChange: (field: ImportableField, column: string | null) => void;
  onBack: () => void;
  onContinue: () => void;
}): JSX.Element {
  const sampleFor = (column: string | null): string => {
    if (!column) return "—";
    const index = preview.header.indexOf(column);
    if (index === -1) return "—";
    const samples = preview.rows
      .map((row) => row[index])
      .filter((value): value is string => Boolean(value?.trim()))
      .slice(0, 2);
    return samples.length > 0 ? samples.join(" · ") : "—";
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[12.5px]" style={{ color: "var(--graphite)" }}>
          <span className="figure" style={{ color: "var(--parchment)" }}>
            {fileName}
          </span>{" "}
          · {preview.totalRows.toLocaleString()} rows · {preview.header.length}{" "}
          columns
        </p>
        {missingRequired.length > 0 && (
          <span className="eyebrow" style={{ color: "var(--outflow)" }}>
            {missingRequired.join(", ")} still needed
          </span>
        )}
      </div>

      <ul
        className="rounded border divide-y"
        style={{ borderColor: "var(--rule)" }}
      >
        {IMPORTABLE_FIELDS.map((field) => {
          const isRequired = REQUIRED_FIELDS.includes(field);
          const column = mapping[field];
          return (
            <li
              key={field}
              className="flex flex-wrap items-center gap-3 px-3 py-2.5"
              style={{ borderColor: "var(--rule)" }}
            >
              <span className="w-28 text-[12.5px]">
                {field}
                {isRequired && (
                  <span
                    style={{ color: "var(--outflow)" }}
                    aria-label="required"
                  >
                    {" "}
                    *
                  </span>
                )}
              </span>

              <select
                value={column ?? ""}
                onChange={(event) =>
                  onChange(field, event.target.value || null)
                }
                aria-label={`CSV column for ${field}`}
                className="rounded border bg-transparent px-2 py-1 text-[12.5px] outline-none"
                style={{
                  borderColor:
                    isRequired && !column ? "var(--outflow)" : "var(--rule)",
                  color: "var(--parchment)",
                  background: "var(--surface-raised)",
                }}
              >
                <option value="">Not mapped</option>
                {preview.header.map((headerName) => (
                  <option key={headerName} value={headerName}>
                    {headerName}
                  </option>
                ))}
              </select>

              <span
                className="figure text-[11.5px] truncate ml-auto max-w-[45%]"
                style={{ color: "var(--graphite)" }}
                title={sampleFor(column)}
              >
                {sampleFor(column)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[12px]" style={{ color: "var(--graphite)" }}>
        Unmapped optional columns fall back to defaults: currency follows the
        workspace, status becomes <span className="figure">completed</span>, and
        unrecognised categories are filed under{" "}
        <span className="figure">other</span>.
      </p>

      <WizardActions
        onBack={onBack}
        backLabel="Choose another file"
        onNext={onContinue}
        nextLabel="Check the file"
        disabled={missingRequired.length > 0}
        isBusy={isBusy}
      />
    </div>
  );
}

function ReviewStep({
  report,
  isBusy,
  onBack,
  onCommit,
}: {
  report: ImportCsvResult;
  isBusy: boolean;
  onBack: () => void;
  onCommit: () => void;
}): JSX.Element {
  const errors = report.issues.filter((issue) => issue.severity === "error");
  const warnings = report.issues.filter(
    (issue) => issue.severity === "warning",
  );
  const canImport = errors.length === 0 && report.acceptedRows > 0;

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <Tally label="Rows found" value={report.totalRows} tone="neutral" />
        <Tally
          label="Ready to import"
          value={report.acceptedRows}
          tone="positive"
        />
        <Tally
          label="Blocked"
          value={report.rejectedRows}
          tone={errors.length ? "negative" : "neutral"}
        />
      </div>

      {errors.length > 0 && (
        <IssueList
          title={`${errors.length} rows can't be imported`}
          hint="Correct these lines in your file and upload it again. Nothing has been imported."
          issues={errors}
          tone="var(--outflow)"
        />
      )}

      {warnings.length > 0 && (
        <IssueList
          title={`${warnings.length} rows were adjusted`}
          hint="These will import with the change shown. Review them if anything looks wrong."
          issues={warnings}
          tone="var(--gold)"
        />
      )}

      {report.preview.length > 0 && (
        <div className="mt-4">
          <h3 className="eyebrow mb-2">
            First {report.preview.length} rows as they will be saved
          </h3>
          <div
            className="rounded border overflow-x-auto"
            style={{ borderColor: "var(--rule)" }}
          >
            <table className="w-full text-[12px]">
              <tbody>
                {report.preview.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b last:border-0"
                    style={{ borderColor: "var(--rule)" }}
                  >
                    <td
                      className="figure px-3 py-1.5"
                      style={{ color: "var(--graphite)" }}
                    >
                      {formatDate(tx.timestamp, "long")}
                    </td>
                    <td className="px-3 py-1.5">{tx.merchant}</td>
                    <td
                      className="px-3 py-1.5 capitalize"
                      style={{ color: "var(--graphite)" }}
                    >
                      {tx.category}
                    </td>
                    <td
                      className="figure px-3 py-1.5 text-right"
                      style={{
                        color:
                          tx.type === "expense"
                            ? "var(--outflow)"
                            : "var(--inflow)",
                      }}
                    >
                      {tx.type === "expense" ? "−" : "+"}
                      {formatMoney(tx.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <WizardActions
        onBack={onBack}
        backLabel="Back to columns"
        onNext={onCommit}
        nextLabel={`Import ${report.acceptedRows} transactions`}
        disabled={!canImport}
        isBusy={isBusy}
      />
    </div>
  );
}

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "positive" | "negative";
}): JSX.Element {
  const color =
    tone === "positive"
      ? "var(--inflow)"
      : tone === "negative"
        ? "var(--outflow)"
        : "var(--parchment)";
  return (
    <div
      className="rounded border px-3 py-2.5"
      style={{ borderColor: "var(--rule)" }}
    >
      <div className="eyebrow">{label}</div>
      <div className="figure text-[20px] mt-1" style={{ color }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function IssueList({
  title,
  hint,
  issues,
  tone,
}: {
  title: string;
  hint: string;
  issues: readonly ImportRowIssue[];
  tone: string;
}): JSX.Element {
  return (
    <div className="mt-4">
      <h3 className="text-[12.5px]" style={{ color: tone }}>
        {title}
      </h3>
      <p className="text-[12px] mt-0.5" style={{ color: "var(--graphite)" }}>
        {hint}
      </p>
      <ul
        className="mt-2 rounded border divide-y max-h-52 overflow-y-auto"
        style={{ borderColor: "var(--rule)" }}
      >
        {issues.slice(0, 20).map((issue, index) => (
          <li
            key={`${issue.line}-${index}`}
            className="flex items-baseline gap-3 px-3 py-1.5 text-[12px]"
          >
            <span
              className="figure w-14 shrink-0"
              style={{ color: "var(--graphite)" }}
            >
              line {issue.line}
            </span>
            <span className="eyebrow w-16 shrink-0">
              {issue.field ?? "row"}
            </span>
            <span style={{ color: "var(--parchment)" }}>{issue.message}</span>
            {issue.rawValue && (
              <span
                className="figure ml-auto truncate max-w-[30%]"
                style={{ color: tone }}
              >
                {issue.rawValue}
              </span>
            )}
          </li>
        ))}
      </ul>
      {issues.length > 20 && (
        <p className="eyebrow mt-1.5">and {issues.length - 20} more</p>
      )}
    </div>
  );
}

function WizardActions({
  onBack,
  backLabel,
  onNext,
  nextLabel,
  disabled,
  isBusy,
}: {
  onBack: () => void;
  backLabel: string;
  onNext: () => void;
  nextLabel: string;
  disabled: boolean;
  isBusy: boolean;
}): JSX.Element {
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[12.5px]"
        style={{ color: "var(--graphite)" }}
      >
        <X size={13} />
        {backLabel}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled || isBusy}
        className="flex items-center gap-2 rounded px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-40"
        style={{ background: "var(--gold)", color: "var(--ink)" }}
      >
        {isBusy && <Loader2 size={13} className="animate-spin" />}
        {nextLabel}
      </button>
    </div>
  );
}
