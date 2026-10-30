/**
 * Group-level aggregation of resolved market transfers.
 *
 * Each transfer moves `points` from the MM to the taker (or the reverse when
 * negative), so totals and pairwise balances both fall out of one pass.
 */

export interface LedgerEntry {
  makerId: string;
  takerId: string;
  points: number;
}

/** Net points per player. All values sum to zero. */
export function totals(entries: LedgerEntry[]): Map<string, number> {
  const result = new Map<string, number>();
  const add = (id: string, amount: number) => result.set(id, (result.get(id) ?? 0) + amount);
  for (const e of entries) {
    add(e.takerId, e.points);
    add(e.makerId, -e.points);
  }
  return result;
}

export interface PlayerStats {
  /** Markets where the player took a side. */
  taken: number;
  takerPoints: number;
  /** Markets the player made. */
  made: number;
  makerPoints: number;
}

/** Splits each player's record into taking and market-making. */
export function playerStats(entries: (LedgerEntry & { marketId: string })[]): Map<string, PlayerStats> {
  const result = new Map<string, PlayerStats>();
  const madeMarkets = new Map<string, Set<string>>();
  const get = (id: string) => {
    let s = result.get(id);
    if (!s) result.set(id, (s = { taken: 0, takerPoints: 0, made: 0, makerPoints: 0 }));
    return s;
  };
  for (const e of entries) {
    const taker = get(e.takerId);
    taker.taken += 1;
    taker.takerPoints += e.points;

    const maker = get(e.makerId);
    maker.makerPoints -= e.points;
    const made = madeMarkets.get(e.makerId) ?? new Set<string>();
    made.add(e.marketId);
    madeMarkets.set(e.makerId, made);
    maker.made = made.size;
  }
  return result;
}

/**
 * Net points between every pair of players who have traded.
 * `balances.get(a)?.get(b)` is what `a` has won from `b`; it always equals
 * minus `balances.get(b)?.get(a)`.
 */
export function pairwiseBalances(entries: LedgerEntry[]): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  const add = (from: string, to: string, amount: number) => {
    const row = result.get(from) ?? new Map<string, number>();
    row.set(to, (row.get(to) ?? 0) + amount);
    result.set(from, row);
  };
  for (const e of entries) {
    add(e.takerId, e.makerId, e.points);
    add(e.makerId, e.takerId, -e.points);
  }
  return result;
}
