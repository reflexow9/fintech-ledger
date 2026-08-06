import type {
  ApiError,
  ApiErrorCode,
  ApiResponse,
  FieldIssue,
  Session,
} from "@fintech/shared";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      session?: Session;
    }
  }
}

const STATUS_BY_CODE: Readonly<Record<ApiErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION_FAILED: 422,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class HttpError extends Error {
  readonly code: ApiErrorCode;
  readonly issues: readonly FieldIssue[] | undefined;

  constructor(
    code: ApiErrorCode,
    message: string,
    issues?: readonly FieldIssue[],
  ) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.issues = issues;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export function ok<T>(res: Response, data: T): Response {
  const body: ApiResponse<T> = { ok: true, data, requestId: res.req.requestId };
  return res.json(body);
}

export function requestId(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const incoming = req.header("x-request-id");
  req.requestId = incoming && incoming.length <= 64 ? incoming : randomUUID();
  next();
}

export function decodeMockJwt(token: string): Session | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (!isSession(parsed)) return null;
    if (new Date(parsed.expiresAt).getTime() < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.token === "string" &&
    typeof candidate.activeWorkspaceId === "string" &&
    typeof candidate.expiresAt === "string" &&
    typeof candidate.user === "object" &&
    candidate.user !== null &&
    Array.isArray(candidate.workspaces)
  );
}

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    next(new HttpError("UNAUTHENTICATED", "Sign in to continue"));
    return;
  }
  const session = decodeMockJwt(header.slice("Bearer ".length));
  if (!session) {
    next(
      new HttpError(
        "UNAUTHENTICATED",
        "Your session has expired. Sign in again",
      ),
    );
    return;
  }
  req.session = session;
  next();
}

export function resolveWorkspaceId(req: Request): string {
  const requested =
    req.header("x-workspace-id") ?? req.session?.activeWorkspaceId;
  if (!requested)
    throw new HttpError("VALIDATION_FAILED", "No workspace selected");

  const permitted =
    req.session?.workspaces.some((w) => w.id === requested) ?? false;
  if (!permitted) {
    throw new HttpError("NOT_FOUND", "Workspace not found");
  }
  return requested;
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const httpError =
    error instanceof HttpError
      ? error
      : new HttpError("INTERNAL", "Something went wrong on our end");

  if (!(error instanceof HttpError)) {
    console.error(`[${req.requestId}] unhandled`, error);
  }

  const body: ApiError = {
    code: httpError.code,
    message: httpError.message,
    requestId: req.requestId,
    ...(httpError.issues ? { issues: httpError.issues } : {}),
  };

  res
    .status(httpError.status)
    .json({ ok: false, error: body } satisfies ApiResponse<never>);
}

export const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<void> | void) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res)).catch(next);
  };
