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
  // Four participants, so the pot is 400: winners share +400, losers pay 400.
  it("scores the worked example from the plan", () => {
    const result = scoreMarket(quote(), 60);
    expect(result.transfers.map((t) => [t.takerId, t.raw])).toEqual([
      ["alice", 10],
      ["bob", 10],
      ["carol", -20],
    ]);
    expect(result.makerRaw).toBe(0);
    expect(pointsBy(result)).toEqual({ alice: 200, bob: 200, carol: -400 });
    expect(result.makerPoints).toBe(0);
  });

  it("is zero-sum, and moves exactly the pot", () => {
    for (const x of [-123.4, 0, 1, 39, 45, 51, 1e6]) {
      const r = scoreMarket(quote(), x);
      const all = [...r.transfers.map((t) => t.points), r.makerPoints];
      expect(all.reduce((s, p) => s + p, 0)).toBeCloseTo(0, 9);
      expect(all.reduce((s, p) => s + Math.max(0, p), 0)).toBeCloseTo(400, 9);
    }
  });

  it("makes the MM win the pot when x lands inside the range", () => {
    const r = scoreMarket(quote(), 45);
    for (const p of Object.values(pointsBy(r))) expect(p).toBeCloseTo(-400 / 3, 9);
    expect(r.makerPoints).toBeCloseTo(400, 9);
  });

  it("splits winnings and losses in proportion to raw results", () => {
    const r = scoreMarket(quote({ positions: [{ userId: "a", side: "LOWER" }, { userId: "b", side: "LOWER" }] }), 20);
    expect(pointsBy(r)).toEqual({ a: 150, b: 150 });
    expect(r.makerPoints).toBe(-300);
  });

  it("handles answers of 0 and negative answers", () => {
    const zero = scoreMarket(quote(), 0);
    expect(pointsBy(zero)).toEqual({ alice: -200, bob: -200, carol: 160 });
    expect(zero.makerPoints).toBeCloseTo(240, 9);
    const neg = scoreMarket(quote({ low: -20, high: -10, positions: [{ userId: "a", side: "LOWER" }] }), -40);
    expect(neg.transfers[0].points).toBe(200);
  });

  it("doesn't depend on the question's scale or offset", () => {
    const base = scoreMarket(quote(), 60);
    const scaled = scoreMarket(quote({ low: 40_000, high: 50_000 }), 60_000);
    const shifted = scoreMarket(quote({ low: 1040, high: 1050 }), 1060);
    base.transfers.forEach((t, i) => {
      expect(scaled.transfers[i].points).toBeCloseTo(t.points, 9);
      expect(shifted.transfers[i].points).toBeCloseTo(t.points, 9);
    });
  });

  it("scores nothing when everyone breaks even", () => {
    const r = scoreMarket(quote({ positions: [{ userId: "a", side: "HIGHER" }] }), 50);
    expect(r.transfers[0].points).toBe(0);
    expect(r.makerPoints).toBe(0);
  });

  it("rejects invalid markets", () => {
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
    expect(t.get("alice")).toBeCloseTo(200 - 200, 9);
    expect(t.get("mm")).toBeCloseTo(0 + 200, 9);
    expect([...t.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
  });

  it("player stats split taking from making", () => {
    const withIds = [
      ...market1.map((t) => ({ ...t, marketId: "m1" })),
      ...market2.map((t) => ({ ...t, marketId: "m2" })),
    ];
    const s = playerStats(withIds);
    expect(s.get("mm")).toEqual({ taken: 1, takerPoints: 200, made: 1, makerPoints: 0 });
    expect(s.get("alice")!.made).toBe(1);
    expect(s.get("alice")!.makerPoints).toBe(-200);
    expect(s.get("carol")).toEqual({ taken: 1, takerPoints: -400, made: 0, makerPoints: 0 });
  });

  it("pairwise balances are antisymmetric and match totals", () => {
    const b = pairwiseBalances(entries);
    expect(b.get("alice")!.get("mm")).toBeCloseTo(200 - 200, 9);
    expect(b.get("mm")!.get("alice")).toBeCloseTo(-(200 - 200), 9);
    expect(b.get("bob")!.has("carol")).toBe(false);
    const t = totals(entries);
    for (const [id, row] of b) {
      expect([...row.values()].reduce((a, x) => a + x, 0)).toBeCloseTo(t.get(id)!, 9);
    }
  });
});
