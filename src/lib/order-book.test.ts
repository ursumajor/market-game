import { describe, expect, it } from "vitest";
import { bestAsk, bestBid, isCrossed, tradeBlocker, scoreTrades, type Quote, type TradeContext } from "./order-book";

const quote = (overrides: Partial<Quote> = {}): Quote => ({
  id: "q1",
  makerId: "ann",
  low: 40,
  high: 50,
  acceptingTrades: true,
  tradeCount: 0,
  maxTrades: null,
  ...overrides,
});

const ctx = (overrides: Partial<TradeContext> = {}): TradeContext => ({
  userId: "bob",
  closed: false,
  tradedQuoteIds: new Set(),
  ...overrides,
});

describe("best bid and ask", () => {
  const book = [
    quote({ id: "a", low: 40, high: 50 }),
    quote({ id: "b", low: 42, high: 55 }),
    quote({ id: "c", low: 45, high: 47, acceptingTrades: false }),
    quote({ id: "d", low: 44, high: 46, maxTrades: 2, tradeCount: 2 }),
  ];

  it("ignores withdrawn and full quotes", () => {
    expect(bestBid(book)).toBe(42);
    expect(bestAsk(book)).toBe(50);
    expect(isCrossed(book)).toBe(false);
  });

  it("is null for an empty book", () => {
    expect(bestBid([])).toBeNull();
    expect(bestAsk([])).toBeNull();
    expect(isCrossed([])).toBe(false);
  });

  it("detects crossed quotes", () => {
    expect(isCrossed([quote({ id: "a", low: 40, high: 50 }), quote({ id: "b", makerId: "ben", low: 55, high: 65 })])).toBe(true);
  });
});

describe("tradeBlocker", () => {
  it("allows a normal trade", () => {
    expect(tradeBlocker(quote(), ctx())).toBeNull();
  });

  it("explains each reason a trade isn't allowed", () => {
    expect(tradeBlocker(quote(), ctx({ closed: true }))).toMatch(/closed/);
    expect(tradeBlocker(quote(), ctx({ userId: "ann" }))).toMatch(/own quote/);
    expect(tradeBlocker(quote({ acceptingTrades: false }), ctx())).toMatch(/withdrawn/);
    expect(tradeBlocker(quote({ maxTrades: 3, tradeCount: 3 }), ctx())).toMatch(/full/);
    expect(tradeBlocker(quote(), ctx({ tradedQuoteIds: new Set(["q1"]) }))).toMatch(/already traded/);
  });

  it("allows trading under the cap", () => {
    expect(tradeBlocker(quote({ maxTrades: 3, tradeCount: 2 }), ctx())).toBeNull();
  });
});

describe("scoreTrades", () => {
  const ann = { quoteId: "a", makerId: "ann", low: 40, high: 50 };

  it("shares one pot over every trade on the question", () => {
    // Bob buys at 50 (+10), Cat sells at 40 (−20), so Ann nets +10. Three participants: pot 300.
    const scored = scoreTrades(
      [
        { ...ann, takerId: "bob", side: "BUY" as const },
        { ...ann, takerId: "cat", side: "SELL" as const },
      ],
      60,
    );
    expect(scored.map((t) => [t.takerId, t.raw, t.points])).toEqual([
      ["bob", 10, 150],
      ["cat", -20, -300],
    ]);
  });

  it("still profits when buying from one MM and selling to another whose quotes cross", () => {
    const trades = [
      { ...ann, takerId: "bob", side: "BUY" as const },
      { quoteId: "b", makerId: "ben", takerId: "bob", low: 55, high: 65, side: "SELL" as const },
    ];
    for (const x of [10, 45, 52, 70, 1000]) {
      const bob = scoreTrades(trades, x).reduce((s, t) => s + t.points, 0);
      expect(bob).toBeGreaterThan(0);
    }
  });
});
