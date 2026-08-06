import type { CreateBudgetRequest } from "@fintech/shared";
import { isBudgetPeriod, isCategory, money } from "@fintech/shared";
import { Router } from "express";
import type { TransactionRepository } from "../data/transaction.repository";
import {
  asyncRoute,
  authenticate,
  HttpError,
  ok,
  resolveWorkspaceId,
} from "../middleware/http";
import { buildBudgets } from "../services/budget.service";
import { parseAmount } from "../services/csv-import.service";

export function createBudgetsController(
  repository: TransactionRepository,
): Router {
  const router = Router();

  router.get(
    "/",
    authenticate,
    asyncRoute((req, res) => {
      const workspaceId = resolveWorkspaceId(req);
      const budgets = buildBudgets(
        repository.listBudgets(workspaceId),
        repository.listByWorkspace(workspaceId),
      );
      ok(res, budgets);
    }),
  );

  router.post(
    "/",
    authenticate,
    asyncRoute((req, res) => {
      const workspaceId = resolveWorkspaceId(req);
      const workspace = repository.findWorkspace(workspaceId);
      if (!workspace) throw new HttpError("NOT_FOUND", "Workspace not found");

      const input = parseCreateBudgetRequest(req.body);
      const parsedAmount = parseAmount(input.limit);
      if (parsedAmount.value === null) {
        throw new HttpError(
          "VALIDATION_FAILED",
          `Can't read "${input.limit}" as an amount`,
          [
            {
              path: "limit",
              message: `Can't read "${input.limit}" as an amount`,
            },
          ],
        );
      }
      if (parsedAmount.value.minorUnits <= 0) {
        throw new HttpError(
          "VALIDATION_FAILED",
          "Enter a limit greater than zero",
          [{ path: "limit", message: "Enter a limit greater than zero" }],
        );
      }

      const stored = repository.upsertBudget({
        workspaceId,
        category: input.category,
        limit: money(parsedAmount.value.minorUnits, workspace.baseCurrency),
        period: input.period ?? "monthly",
      });

      const [budget] = buildBudgets(
        [stored],
        repository.listByWorkspace(workspaceId),
      );
      res.status(201);
      ok(res, budget);
    }),
  );

  router.delete(
    "/:id",
    authenticate,
    asyncRoute((req, res) => {
      const workspaceId = resolveWorkspaceId(req);
      const removed = repository.deleteBudget(workspaceId, req.params.id ?? "");
      if (!removed) throw new HttpError("NOT_FOUND", "Limit not found");
      ok(res, { id: req.params.id });
    }),
  );

  return router;
}

function parseCreateBudgetRequest(body: unknown): CreateBudgetRequest {
  if (typeof body !== "object" || body === null) {
    throw new HttpError("VALIDATION_FAILED", "Expected a JSON body");
  }
  const candidate = body as Record<string, unknown>;

  const category =
    typeof candidate.category === "string" && isCategory(candidate.category)
      ? candidate.category
      : null;
  if (!category) {
    throw new HttpError("VALIDATION_FAILED", "Choose a category", [
      { path: "category", message: "Unknown category" },
    ]);
  }

  const limit =
    typeof candidate.limit === "string"
      ? candidate.limit
      : typeof candidate.limit === "number"
        ? String(candidate.limit)
        : "";
  if (limit.trim() === "") {
    throw new HttpError("VALIDATION_FAILED", "Enter a limit", [
      { path: "limit", message: "Required" },
    ]);
  }

  return {
    category,
    limit,
    ...(typeof candidate.period === "string" && isBudgetPeriod(candidate.period)
      ? { period: candidate.period }
      : {}),
  };
}
