import cors from "cors";
import express, { type Express } from "express";
import { createAnalyticsController } from "./controllers/analytics.controller";
import { createBudgetsController } from "./controllers/budgets.controller";
import { createTransactionsController } from "./controllers/transactions.controller";
import {
  createInMemoryRepository,
  WORKSPACES,
  type TransactionRepository,
} from "./data/transaction.repository";
import { errorHandler, ok, requestId } from "./middleware/http";
import type { Session } from "@fintech/shared";

export interface AppDependencies {
  readonly repository?: TransactionRepository;
}

export function createApp(dependencies: AppDependencies = {}): Express {
  const repository = dependencies.repository ?? createInMemoryRepository();
  const app = express();

  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.text({ type: "text/csv", limit: "10mb" }));
  app.use(requestId);

  app.get("/health", (_req, res) => {
    ok(res, { status: "up", at: new Date().toISOString() });
  });

  app.post("/api/auth/session", (_req, res) => {
    const payload = {
      user: {
        id: "usr_01",
        name: "Artem Bondarev",
        email: "artembond.corporation@gmail.com",
        role: "owner",
      },
      workspaces: WORKSPACES,
      activeWorkspaceId: WORKSPACES[0]?.id ?? "ws_personal",
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    };
    const encoded = Buffer.from(
      JSON.stringify({ ...payload, token: "mock" }),
    ).toString("base64url");
    const session: Session = {
      ...payload,
      token: `mock.${encoded}.sig`,
    } as Session;
    ok(res, session);
  });

  app.use("/api/analytics", createAnalyticsController(repository));
  app.use("/api/transactions", createTransactionsController(repository));
  app.use("/api/budgets", createBudgetsController(repository));

  app.use(errorHandler);
  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 4000);
  createApp().listen(port, () => {
    console.log(`fintech api listening on :${port}`);
  });
}
