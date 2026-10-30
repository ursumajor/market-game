import { describe, expect, it } from "vitest";
import { scoreMarket, validateMarket, validateTrueValue, type MarketQuote } from "./scoring";
import { pairwiseBalances, playerStats, totals } from "./ledger";

const quote = (overrides: Partial<MarketQuote> = {}): MarketQuote => ({
  makerId: "mm",
  low: 40,
  high: 50,
  positions: [
    { userId: "alice", side: "HIGHER" },
    { userId: "bob", side: "HIGHER" },
    { userId: "carol", side: "LOWER" },
  ],
  ...overrides,
});

const pointsBy = (result: ReturnType<typeof scoreMarket>) =>
  Object.fromEntries(result.transfers.map((t) => [t.takerId, t.points]));

describe("scoreMarket", () => {
  it("scores the worked example from the plan", () => {
    const result = scoreMarket(quote(), 60);
    expect(result.transfers.map((t) => [t.takerId, t.raw])).toEqual([
      ["alice", 10],
      ["bob", 10],
      ["carol", -20],
    ]);
    expect(result.makerRaw).toBe(0);
    expect(pointsBy(result)).toEqual({ alice: 10 / 60, bob: 10 / 60, carol: -20 / 60 });
    expect(result.makerPoints).toBe(0);
  });

  it("is zero-sum", () => {
    for (const x of [-123.4, 1, 39, 45, 50, 51, 1e6]) {
      const r = scoreMarket(quote(), x);
      const total = r.transfers.reduce((s, t) => s + t.points, 0) + r.makerPoints;
      expect(total).toBeCloseTo(0, 12);
    }
  });

  it("makes the MM win from everyone when x lands inside the range", () => {
    const r = scoreMarket(quote(), 45);
    expect(pointsBy(r)).toEqual({ alice: -5 / 45, bob: -5 / 45, carol: -5 / 45 });
    expect(r.makerPoints).toBeCloseTo(15 / 45, 12);
  });

  it("handles every taker on one side", () => {
    const r = scoreMarket(quote({ positions: [{ userId: "a", side: "LOWER" }, { userId: "b", side: "LOWER" }] }), 20);
    expect(pointsBy(r)).toEqual({ a: 1, b: 1 });
    expect(r.makerPoints).toBe(-2);
  });

  it("normalizes by |x| for negative answers", () => {
    const r = scoreMarket(quote({ low: -20, high: -10, positions: [{ userId: "a", side: "LOWER" }] }), -40);
    expect(r.transfers[0].raw).toBe(20);
    expect(r.transfers[0].points).toBe(0.5);
  });

  it("is scale-invariant", () => {
    const small = scoreMarket(quote(), 60);
    const big = scoreMarket(quote({ low: 40_000, high: 50_000 }), 60_000);
    small.transfers.forEach((t, i) => expect(big.transfers[i].points).toBeCloseTo(t.points, 12));
  });

  it("rejects x = 0 and invalid markets", () => {
    expect(() => scoreMarket(quote(), 0)).toThrow(/can't be 0/);
    expect(() => scoreMarket(quote({ low: 50, high: 50 }), 1)).toThrow(/less than high/);
  });
});

describe("validateMarket", () => {
  it("accepts a valid market", () => {
    expect(validateMarket(quote())).toEqual([]);
  });

  it("reports each problem once", () => {
    const errors = validateMarket(
      quote({
        low: 5,
        high: 1,
        positions: [
          { userId: "mm", side: "HIGHER" },
          { userId: "a", side: "HIGHER" },
          { userId: "a", side: "LOWER" },
          { userId: "a", side: "LOWER" },
        ],
      }),
    );
    expect(errors).toEqual([
      "Low must be strictly less than high.",
      "The market maker cannot also take a side.",
      "Each player can only take one side.",
    ]);
  });

  it("requires at least one taker", () => {
    expect(validateMarket(quote({ positions: [] }))).toEqual(["At least one player must take a side."]);
  });

  it("rejects non-numeric values", () => {
    expect(validateMarket(quote({ low: NaN }))).toContain("Low and high must be numbers.");
    expect(validateTrueValue(Infinity)).toEqual(["The true value must be a number."]);
  });
});

describe("ledger", () => {
  const market1 = scoreMarket(quote(), 60).transfers;
  const market2 = scoreMarket(
    quote({ makerId: "alice", low: 0, high: 10, positions: [{ userId: "mm", side: "HIGHER" }] }),
    20,
  ).transfers;
  const entries = [...market1, ...market2];

  it("totals sum to zero and include MMs", () => {
    const t = totals(entries);
    expect(t.get("alice")).toBeCloseTo(10 / 60 - 0.5, 12);
    expect(t.get("mm")).toBeCloseTo(0 + 0.5, 12);
    expect([...t.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
  });

  it("player stats split taking from making", () => {
    const withIds = [
      ...market1.map((t) => ({ ...t, marketId: "m1" })),
      ...market2.map((t) => ({ ...t, marketId: "m2" })),
    ];
    const s = playerStats(withIds);
    expect(s.get("mm")).toEqual({ taken: 1, takerPoints: 0.5, made: 1, makerPoints: 0 });
    expect(s.get("alice")!.made).toBe(1);
    expect(s.get("alice")!.makerPoints).toBe(-0.5);
    expect(s.get("carol")).toEqual({ taken: 1, takerPoints: -20 / 60, made: 0, makerPoints: 0 });
  });

  it("pairwise balances are antisymmetric and match totals", () => {
    const b = pairwiseBalances(entries);
    expect(b.get("alice")!.get("mm")).toBeCloseTo(10 / 60 - 0.5, 12);
    expect(b.get("mm")!.get("alice")).toBeCloseTo(-(10 / 60 - 0.5), 12);
    expect(b.get("bob")!.has("carol")).toBe(false);
    const t = totals(entries);
    for (const [id, row] of b) {
      expect([...row.values()].reduce((a, x) => a + x, 0)).toBeCloseTo(t.get(id)!, 12);
    }
  });
});
