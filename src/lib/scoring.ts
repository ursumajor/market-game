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
 * Those raw results are in the question's units, so they're turned into points
 * with a fixed pot (awardPot): POT_PER_PLAYER points for every participant,
 * which the winners share and the losers pay, in proportion to their raw
 * results. Every taker's result is a trade against the MM, which is what lets
 * groups keep a pairwise ledger.
 */

export const POT_PER_PLAYER = 100;

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
  /** The result in the question's units. */
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
  return [];
}

/** What a taker on `side` wins from the MM in the question's units. */
export const rawResult = (side: Side, low: number, high: number, trueValue: number) =>
  side === "HIGHER" ? trueValue - high : low - trueValue;

/**
 * Turns raw results into points for one question (a recorded market, or every
 * trade on an online question together). The pot is POT_PER_PLAYER times the
 * number of participants: winners (net raw > 0) share +pot and losers share
 * -pot, each in proportion to their net raw result.
 *
 * Since total winnings equal total losses, that's the same as multiplying every
 * raw transfer by pot / (total winnings), so pairwise head to head stays exact.
 */
export function awardPot<T extends { makerId: string; takerId: string; raw: number }>(raws: T[]): (T & { points: number })[] {
  const net = new Map<string, number>();
  for (const t of raws) {
    net.set(t.takerId, (net.get(t.takerId) ?? 0) + t.raw);
    net.set(t.makerId, (net.get(t.makerId) ?? 0) - t.raw);
  }
  const winnings = [...net.values()].reduce((s, v) => s + Math.max(0, v), 0);
  const factor = winnings > 0 ? (POT_PER_PLAYER * net.size) / winnings : 0;
  // `0 +` so a break-even result is 0, not -0.
  return raws.map((t) => ({ ...t, points: 0 + t.raw * factor }));
}

export function scoreMarket(market: MarketQuote, trueValue: number): MarketResult {
  const errors = [...validateMarket(market), ...validateTrueValue(trueValue)];
  if (errors.length > 0) throw new Error(errors.join(" "));

  const transfers: Transfer[] = awardPot(
    market.positions.map((p) => ({ makerId: market.makerId, takerId: p.userId, raw: rawResult(p.side, market.low, market.high, trueValue) })),
  );

  const sum = (key: "raw" | "points") => transfers.reduce((acc, t) => acc + t[key], 0);
  // `0 - x` rather than `-x` so a break-even MM scores 0, not -0.
  return { transfers, makerRaw: 0 - sum("raw"), makerPoints: 0 - sum("points") };
}
