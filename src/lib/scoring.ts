/**
 * Market Game scoring.
 *
 * A market maker (MM) quotes a range [low, high]. Every other participant
 * (a "taker") says the true value is HIGHER or LOWER. Once the true value x
 * is known:
 *   - HIGHER takers score  x - high
 *   - LOWER takers score   low - x
 *   - the MM scores minus the sum of all takers, so each market is zero-sum.
 *
 * Scores are normalized by |x| so that markets on different scales are
 * comparable. Every taker's result is a trade against the MM, which is what
 * lets groups keep a pairwise ledger.
 */

export type Side = "HIGHER" | "LOWER";

export interface Position {
  userId: string;
  side: Side;
}

export interface MarketQuote {
  makerId: string;
  low: number;
  high: number;
  positions: Position[];
}

export interface Transfer {
  makerId: string;
  takerId: string;
  /** Unnormalized points, in the question's units. */
  raw: number;
  /** Points won by the taker (and lost by the MM); negative means the reverse. */
  points: number;
}

export interface MarketResult {
  transfers: Transfer[];
  makerRaw: number;
  makerPoints: number;
}

/** Returns a list of human-readable problems; empty means the market is valid. */
export function validateMarket(market: MarketQuote): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(market.low) || !Number.isFinite(market.high)) {
    errors.push("Low and high must be numbers.");
  } else if (market.low >= market.high) {
    errors.push("Low must be strictly less than high.");
  }
  if (market.positions.length === 0) {
    errors.push("At least one player must take a side.");
  }
  const seen = new Set<string>();
  for (const p of market.positions) {
    if (p.userId === market.makerId) {
      errors.push("The market maker cannot also take a side.");
    }
    if (seen.has(p.userId)) {
      errors.push("Each player can only take one side.");
    }
    seen.add(p.userId);
  }
  return [...new Set(errors)];
}

export function validateTrueValue(trueValue: number): string[] {
  if (!Number.isFinite(trueValue)) return ["The true value must be a number."];
  if (trueValue === 0) {
    return ["The true value can't be 0, because scores are divided by it."];
  }
  return [];
}

export function scoreMarket(market: MarketQuote, trueValue: number): MarketResult {
  const errors = [...validateMarket(market), ...validateTrueValue(trueValue)];
  if (errors.length > 0) throw new Error(errors.join(" "));

  const scale = Math.abs(trueValue);
  const transfers = market.positions.map((p): Transfer => {
    const raw = p.side === "HIGHER" ? trueValue - market.high : market.low - trueValue;
    return { makerId: market.makerId, takerId: p.userId, raw, points: raw / scale };
  });

  const sum = (key: "raw" | "points") => transfers.reduce((acc, t) => acc + t[key], 0);
  // `0 - x` rather than `-x` so a break-even MM scores 0, not -0.
  return { transfers, makerRaw: 0 - sum("raw"), makerPoints: 0 - sum("points") };
}
