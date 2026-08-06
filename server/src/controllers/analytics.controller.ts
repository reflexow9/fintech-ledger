import type { AnalyticsSummary } from "@fintech/shared";
import { Router } from "express";
import type { TransactionRepository } from "../data/transaction.repository";
import {
  asyncRoute,
  authenticate,
  HttpError,
  ok,
  resolveWorkspaceId,
} from "../middleware/http";
import { buildAnalyticsSummary } from "../services/analytics.service";

const ALLOWED_RANGES = new Set([7, 30, 90, 365]);

export function createAnalyticsController(
  repository: TransactionRepository,
): Router {
  const router = Router();

  router.get(
    "/overview",
    authenticate,
    asyncRoute((req, res) => {
      const workspaceId = resolveWorkspaceId(req);
      const workspace = repository.findWorkspace(workspaceId);
      if (!workspace) throw new HttpError("NOT_FOUND", "Workspace not found");

      const requested = Number(req.query.rangeDays ?? 30);
      if (!ALLOWED_RANGES.has(requested)) {
        throw new HttpError(
          "VALIDATION_FAILED",
          "Choose a range of 7, 30, 90 or 365 days",
          [{ path: "rangeDays", message: "Unsupported range" }],
        );
      }

      const summary: AnalyticsSummary = buildAnalyticsSummary(
        workspaceId,
        workspace.baseCurrency,
        repository.listByWorkspace(workspaceId),
        { rangeDays: requested },
      );

      res.setHeader("Cache-Control", "private, max-age=60");
      ok(res, summary);
    }),
  );

  return router;
}
