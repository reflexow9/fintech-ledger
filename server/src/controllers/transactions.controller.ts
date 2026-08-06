import type {
  CreateTransactionRequest,
  FieldIssue,
  ImportableField,
  ImportCsvRequest,
  Page,
  SchemaMapping,
  Transaction,
} from "@fintech/shared";
import {
  IMPORTABLE_FIELDS,
  isCategory,
  isCurrencyCode,
  isTransactionStatus,
  isTransactionType,
  money,
} from "@fintech/shared";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { TransactionRepository } from "../data/transaction.repository";
import {
  asyncRoute,
  authenticate,
  HttpError,
  ok,
  resolveWorkspaceId,
} from "../middleware/http";
import { parseAmount, validateAndBuild } from "../services/csv-import.service";
import {
  parseTransactionQuery,
  queryTransactions,
} from "../services/query.service";

const MAX_CSV_BYTES = 8 * 1024 * 1024;

export function createTransactionsController(
  repository: TransactionRepository,
): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    asyncRoute((req, res) => {
      const workspaceId = resolveWorkspaceId(req);
      const query = parseTransactionQuery(req.query as Record<string, unknown>);
      const page: Page<Transaction> = queryTransactions(
        repository.listByWorkspace(workspaceId),
        query,
      );
      ok(res, page);
    }),
  );

  router.post(
    "/",
    authenticate,
    asyncRoute((req, res) => {
      const workspaceId = resolveWorkspaceId(req);
      const workspace = repository.findWorkspace(workspaceId);
      if (!workspace) throw new HttpError("NOT_FOUND", "Workspace not found");

      const input = parseCreateRequest(req.body);
      const parsedAmount = parseAmount(input.amount);

      const issues: FieldIssue[] = [];
      if (input.merchant.trim() === "") {
        issues.push({
          path: "merchant",
          message: "Give this transaction a name",
        });
      }
      if (input.merchant.length > 120) {
        issues.push({
          path: "merchant",
          message: "Keep the name under 120 characters",
        });
      }
      if (parsedAmount.value === null) {
        issues.push({
          path: "amount",
          message: `Can't read "${input.amount}" as an amount`,
        });
      } else if (parsedAmount.value.minorUnits <= 0) {
        issues.push({
          path: "amount",
          message: "Enter an amount greater than zero",
        });
      }

      const timestamp = input.timestamp ?? new Date().toISOString();
      const occurredAt = new Date(timestamp);
      if (Number.isNaN(occurredAt.getTime())) {
        issues.push({
          path: "timestamp",
          message: "That date could not be read",
        });
      } else if (occurredAt.getTime() > Date.now() + 60_000) {
        issues.push({
          path: "timestamp",
          message: "A transaction cannot be dated in the future",
        });
      }

      if (issues.length > 0 || !parsedAmount.value) {
        throw new HttpError(
          "VALIDATION_FAILED",
          "Check the highlighted fields",
          issues,
        );
      }

      const currency = input.currency ?? workspace.baseCurrency;
      const note = input.note?.trim();

      const transaction: Transaction = {
        id: randomUUID(),
        workspaceId,
        amount: money(parsedAmount.value.minorUnits, currency),
        type: input.type,
        status: input.status ?? "completed",
        category: input.category,
        merchant: input.merchant.trim(),
        timestamp: occurredAt.toISOString(),
        ...(note ? { note } : {}),
      };

      repository.insertMany([transaction]);
      res.status(201);
      ok(res, transaction);
    }),
  );

  router.post(
    "/import-csv",
    authenticate,
    asyncRoute((req, res) => {
      const workspaceId = resolveWorkspaceId(req);
      const workspace = repository.findWorkspace(workspaceId);
      if (!workspace) throw new HttpError("NOT_FOUND", "Workspace not found");

      const request = parseImportRequest(
        req.body,
        workspaceId,
        req.is("text/csv") === "text/csv",
      );

      if (Buffer.byteLength(request.csv, "utf8") > MAX_CSV_BYTES) {
        throw new HttpError(
          "PAYLOAD_TOO_LARGE",
          "Files must be under 8 MB. Split and retry",
        );
      }

      const { result, accepted } = validateAndBuild(request, {
        workspaceId,
        baseCurrency: workspace.baseCurrency,
      });

      if (!request.dryRun) {
        if (result.rejectedRows > 0) {
          throw new HttpError(
            "VALIDATION_FAILED",
            `${result.rejectedRows} of ${result.totalRows} rows can't be imported. Fix them and upload again`,
            result.issues
              .filter((issue) => issue.severity === "error")
              .slice(0, 50)
              .map((issue) => ({
                path: `line ${issue.line}`,
                message: issue.message,
              })),
          );
        }
        repository.insertMany(accepted);
      }

      ok(res, result);
    }),
  );

  return router;
}

function parseImportRequest(
  body: unknown,
  workspaceId: string,
  isRawCsv: boolean,
): ImportCsvRequest {
  if (isRawCsv) {
    if (typeof body !== "string") {
      throw new HttpError(
        "VALIDATION_FAILED",
        "Send the file contents as the request body",
      );
    }

    const identity = Object.fromEntries(
      IMPORTABLE_FIELDS.map((field) => [field, field]),
    ) as SchemaMapping;
    return { workspaceId, csv: body, mapping: identity, dryRun: false };
  }

  if (typeof body !== "object" || body === null) {
    throw new HttpError("VALIDATION_FAILED", "Expected a JSON body");
  }
  const candidate = body as Record<string, unknown>;

  if (typeof candidate.csv !== "string" || candidate.csv.trim() === "") {
    throw new HttpError("VALIDATION_FAILED", "The file appears to be empty", [
      { path: "csv", message: "Required" },
    ]);
  }

  const mapping = parseMapping(candidate.mapping);
  const required: readonly ImportableField[] = [
    "timestamp",
    "merchant",
    "amount",
  ];
  const unmapped = required.filter((field) => !mapping[field]);
  if (unmapped.length > 0) {
    throw new HttpError(
      "VALIDATION_FAILED",
      `Map a column to ${unmapped.join(", ")} before importing`,
      unmapped.map((field) => ({
        path: `mapping.${field}`,
        message: "Required",
      })),
    );
  }

  return {
    workspaceId,
    csv: candidate.csv,
    mapping,
    dryRun: candidate.dryRun === true,
    ...(isDefaults(candidate.defaults) ? { defaults: candidate.defaults } : {}),
  };
}

function parseMapping(value: unknown): SchemaMapping {
  const source =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const entries = IMPORTABLE_FIELDS.map(
    (field): [ImportableField, string | null] => {
      const column = source[field];
      return [
        field,
        typeof column === "string" && column.trim() !== "" ? column : null,
      ];
    },
  );
  return Object.fromEntries(entries) as SchemaMapping;
}

function isDefaults(
  value: unknown,
): value is NonNullable<ImportCsvRequest["defaults"]> {
  return typeof value === "object" && value !== null;
}

function parseCreateRequest(body: unknown): CreateTransactionRequest {
  if (typeof body !== "object" || body === null) {
    throw new HttpError("VALIDATION_FAILED", "Expected a JSON body");
  }
  const candidate = body as Record<string, unknown>;

  const merchant =
    typeof candidate.merchant === "string" ? candidate.merchant : "";

  const amount =
    typeof candidate.amount === "string"
      ? candidate.amount
      : typeof candidate.amount === "number"
        ? String(candidate.amount)
        : "";

  const type =
    typeof candidate.type === "string" && isTransactionType(candidate.type)
      ? candidate.type
      : null;
  if (!type) {
    throw new HttpError("VALIDATION_FAILED", "Choose income or expense", [
      { path: "type", message: "Required" },
    ]);
  }

  const category =
    typeof candidate.category === "string" && isCategory(candidate.category)
      ? candidate.category
      : null;
  if (!category) {
    throw new HttpError("VALIDATION_FAILED", "Choose a category", [
      { path: "category", message: "Unknown category" },
    ]);
  }

  return {
    merchant,
    amount,
    type,
    category,
    ...(typeof candidate.currency === "string" &&
    isCurrencyCode(candidate.currency)
      ? { currency: candidate.currency }
      : {}),
    ...(typeof candidate.status === "string" &&
    isTransactionStatus(candidate.status)
      ? { status: candidate.status }
      : {}),
    ...(typeof candidate.timestamp === "string"
      ? { timestamp: candidate.timestamp }
      : {}),
    ...(typeof candidate.note === "string" ? { note: candidate.note } : {}),
  };
}
