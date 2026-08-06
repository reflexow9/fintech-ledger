import { money, type Transaction } from "@fintech/shared";
import { describe, expect, it } from "vitest";
import {
  parseAmount,
  parseCsv,
  parseTimestamp,
  validateAndBuild,
} from "../services/csv-import.service";
import {
  fitLinearRegression,
  forecastSpending,
} from "../services/forecast.service";
import { fuzzyScore } from "../services/query.service";

const MS_PER_DAY = 86_400_000;
const NOW = new Date("2026-06-01T12:00:00.000Z");

const expense = (daysAgo: number, minorUnits: number): Transaction => ({
  id: `tx_${daysAgo}_${minorUnits}`,
  workspaceId: "ws_test",
  amount: money(minorUnits, "USD"),
  type: "expense",
  status: "completed",
  category: "groceries",
  merchant: "Test Market",
  timestamp: new Date(NOW.getTime() - daysAgo * MS_PER_DAY).toISOString(),
});

describe("fitLinearRegression", () => {
  it("recovers the coefficients of a noiseless line exactly", () => {
    const points = Array.from({ length: 30 }, (_, x) => ({
      x,
      y: 100 * x + 500,
    }));
    const fit = fitLinearRegression(points);
    expect(fit.slope).toBeCloseTo(100, 6);
    expect(fit.intercept).toBeCloseTo(500, 6);
    expect(fit.rSquared).toBeCloseTo(1, 6);
  });

  it("degrades safely on a single observation instead of dividing by zero", () => {
    const fit = fitLinearRegression([{ x: 0, y: 42 }]);
    expect(fit.slope).toBe(0);
    expect(fit.intercept).toBe(42);
  });
});

describe("forecastSpending", () => {
  it("refuses to forecast from almost no history", () => {
    const forecast = forecastSpending([expense(1, 5000)], "USD", { now: NOW });
    expect(forecast.method).toBe("insufficient-data");
    expect(forecast.points).toHaveLength(0);
  });

  it("projects 30 days and detects an upward trend", () => {
    const ledger = Array.from({ length: 60 }, (_, i) =>
      expense(60 - i, 5000 + i * 100),
    );
    const forecast = forecastSpending(ledger, "USD", { now: NOW });

    expect(forecast.method).toBe("linear-regression");
    expect(forecast.points).toHaveLength(30);
    expect(forecast.dailyTrendMinorUnits).toBeGreaterThan(0);
    expect(forecast.projectedTotal.minorUnits).toBeGreaterThan(0);
  });

  it("never projects negative spend, however steep the decline", () => {
    const ledger = Array.from({ length: 40 }, (_, i) =>
      expense(40 - i, Math.max(100, 40000 - i * 1000)),
    );
    const forecast = forecastSpending(ledger, "USD", { now: NOW });
    for (const point of forecast.points) {
      expect(point.projected).toBeGreaterThanOrEqual(0);
      expect(point.lowerBound).toBeGreaterThanOrEqual(0);
    }
  });

  it("widens the prediction interval further into the horizon", () => {
    const ledger = Array.from({ length: 60 }, (_, i) =>
      expense(60 - i, 5000 + ((i * 7919) % 3000)),
    );
    const forecast = forecastSpending(ledger, "USD", { now: NOW });
    const first = forecast.points[0];
    const last = forecast.points.at(-1);
    if (!first || !last) throw new Error("expected a populated forecast");
    expect(last.upperBound - last.lowerBound).toBeGreaterThanOrEqual(
      first.upperBound - first.lowerBound,
    );
  });
});

describe("parseAmount", () => {
  it.each([
    ["1,234.56", 123456, false],
    ["1.234,56", 123456, false],
    ["(45.00)", 4500, true],
    ["-$45.00", 4500, true],
    ["€ 9 999,99", 999999, false],
    ["45.00-", 4500, true],
  ])("reads %s", (input, minorUnits, negative) => {
    const result = parseAmount(input);
    expect(result.value?.minorUnits).toBe(minorUnits);
    expect(result.value?.negative).toBe(negative);
  });

  it("rejects text rather than coercing it to zero", () => {
    expect(parseAmount("n/a").value).toBeNull();
  });
});

describe("parseTimestamp", () => {
  it("flags an ambiguous slashed date instead of guessing silently", () => {
    const result = parseTimestamp("03/04/2025");
    expect(result.value).toBe("2025-04-03T00:00:00.000Z");
    expect(result.warning).toBeDefined();
  });

  it("resolves an unambiguous date without a warning", () => {
    const result = parseTimestamp("25/12/2025");
    expect(result.value).toBe("2025-12-25T00:00:00.000Z");
    expect(result.warning).toBeUndefined();
  });
});

describe("parseCsv", () => {
  it("keeps commas inside quoted fields intact", () => {
    const { header, rows } = parseCsv(
      'date,merchant,amount\n2025-01-02,"ACME, Inc.",10.00',
    );
    expect(header).toEqual(["date", "merchant", "amount"]);
    expect(rows[0]?.[1]).toBe("ACME, Inc.");
  });

  it("detects semicolon-delimited exports", () => {
    const { header } = parseCsv("date;merchant;amount\n2025-01-02;Rewe;10,00");
    expect(header).toEqual(["date", "merchant", "amount"]);
  });
});

describe("validateAndBuild", () => {
  const mapping = {
    timestamp: "date",
    merchant: "merchant",
    amount: "amount",
    currency: null,
    type: null,
    category: null,
    status: null,
    note: null,
  } as const;

  it("accepts clean rows and infers direction from the sign", () => {
    const csv =
      "date,merchant,amount\n2025-01-02,Silpo,-64.20\n2025-01-03,Salary,2500.00";
    const { result, accepted } = validateAndBuild(
      { workspaceId: "ws_test", csv, mapping, dryRun: true },
      { workspaceId: "ws_test", baseCurrency: "USD", now: NOW },
    );

    expect(result.acceptedRows).toBe(2);
    expect(accepted[0]?.type).toBe("expense");
    expect(accepted[1]?.type).toBe("income");
  });

  it("reports the user-visible line number for a broken row", () => {
    const csv =
      "date,merchant,amount\n2025-01-02,Silpo,64.20\nnot-a-date,Silpo,10.00";
    const { result } = validateAndBuild(
      { workspaceId: "ws_test", csv, mapping, dryRun: true },
      { workspaceId: "ws_test", baseCurrency: "USD", now: NOW },
    );

    const error = result.issues.find((issue) => issue.severity === "error");
    expect(error?.line).toBe(3);
    expect(error?.code).toBe("UNPARSABLE_DATE");
    expect(result.acceptedRows).toBe(1);
  });

  it("warns about duplicates without blocking the import", () => {
    const csv =
      "date,merchant,amount\n2025-01-02,Silpo,64.20\n2025-01-02,Silpo,64.20";
    const { result } = validateAndBuild(
      { workspaceId: "ws_test", csv, mapping, dryRun: true },
      { workspaceId: "ws_test", baseCurrency: "USD", now: NOW },
    );
    expect(result.issues.some((issue) => issue.code === "DUPLICATE_ROW")).toBe(
      true,
    );
    expect(result.acceptedRows).toBe(2);
  });
});

describe("fuzzyScore", () => {
  it("ranks an exact match above a typo above an unrelated string", () => {
    expect(fuzzyScore("starbucks", "Starbucks")).toBe(1);
    expect(fuzzyScore("starbcks", "Starbucks")).toBeGreaterThan(0.42);
    expect(fuzzyScore("mortgage", "Starbucks")).toBeLessThan(0.42);
  });
});
