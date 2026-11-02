/**
 * Global questions: many market makers post quotes [low, high] on the same
 * question, and anyone can trade any quote. Buying pays the quote's high and
 * wins x - high; selling receives the low and wins low - x. Each trade is a
 * one-taker market against that quote's MM, so scoring is scoring.ts as is.
 */

import { scoreMarket, type Side } from "./scoring";

export const DISPUTE_WINDOW_HOURS = 24;
export const MAX_QUESTION_DAYS = 90;

export type TradeSide = "BUY" | "SELL";

/** Buying says the answer is higher than the quote; selling, lower. */
export const tradeSideToSide = (s: TradeSide): Side => (s === "BUY" ? "HIGHER" : "LOWER");
export const sideToTradeSide = (s: Side): TradeSide => (s === "HIGHER" ? "BUY" : "SELL");

export interface Quote {
  id: string;
  makerId: string;
  low: number;
  high: number;
  acceptingTrades: boolean;
  tradeCount: number;
  maxTrades: number | null;
}

export interface TradeContext {
  userId: string;
  creatorId: string;
  /** Whether trading on the question has closed. */
  closed: boolean;
  /** Quote ids the user has already traded. */
  tradedQuoteIds: Set<string>;
}

const isLive = (q: Quote) => q.acceptingTrades && (q.maxTrades === null || q.tradeCount < q.maxTrades);

/** Highest low among live quotes: the best price to sell at. */
export function bestBid(quotes: Quote[]): number | null {
  const lows = quotes.filter(isLive).map((q) => q.low);
  return lows.length ? Math.max(...lows) : null;
}

/** Lowest high among live quotes: the best price to buy at. */
export function bestAsk(quotes: Quote[]): number | null {
  const highs = quotes.filter(isLive).map((q) => q.high);
  return highs.length ? Math.min(...highs) : null;
}

/** True when someone could buy from one MM and sell to another for a guaranteed profit. */
export function isCrossed(quotes: Quote[]): boolean {
  const bid = bestBid(quotes);
  const ask = bestAsk(quotes);
  return bid !== null && ask !== null && bid > ask;
}

/** Why the user can't trade this quote, or null if they can. */
export function tradeBlocker(quote: Quote, ctx: TradeContext): string | null {
  if (ctx.closed) return "Trading on this question has closed.";
  if (ctx.userId === ctx.creatorId) return "You asked this question, so you can't trade on it.";
  if (quote.makerId === ctx.userId) return "You can't trade your own quote.";
  if (!quote.acceptingTrades) return "This quote has been withdrawn.";
  if (quote.maxTrades !== null && quote.tradeCount >= quote.maxTrades) return "This quote is full.";
  if (ctx.tradedQuoteIds.has(quote.id)) return "You've already traded this quote.";
  return null;
}

/** Why the user can't post a quote on this question, or null if they can. */
export function quoteBlocker(ctx: Pick<TradeContext, "userId" | "creatorId" | "closed">): string | null {
  if (ctx.closed) return "Trading on this question has closed.";
  if (ctx.userId === ctx.creatorId) return "You asked this question, so you can't make a market on it.";
  return null;
}

export interface Trade {
  quoteId: string;
  makerId: string;
  takerId: string;
  low: number;
  high: number;
  side: TradeSide;
}

/** What one trade scores for the taker if the answer is `trueValue`. */
export function tradePoints(trade: Trade, trueValue: number): number {
  const result = scoreMarket(
    { makerId: trade.makerId, low: trade.low, high: trade.high, positions: [{ userId: trade.takerId, side: tradeSideToSide(trade.side) }] },
    trueValue,
  );
  return result.transfers[0].points;
}
