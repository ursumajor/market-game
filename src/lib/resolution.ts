import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { markets, positions, transfers } from "@/db/schema";
import { scoreMarket, type Position } from "./scoring";

// Kept out of "use server" files: anything exported there becomes an action
// the browser can call, and these write points directly.

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const getPositions = (tx: Tx | typeof db, marketId: string) =>
  tx.select({ userId: positions.userId, side: positions.side }).from(positions).where(eq(positions.marketId, marketId));

/** Replaces a market's transfers with freshly scored ones and marks it resolved. */
export async function writeResolution(
  tx: Tx,
  market: { id: string; makerId: string; low: number; high: number },
  marketPositions: Position[],
  trueValue: number,
) {
  const result = scoreMarket({ ...market, positions: marketPositions }, trueValue);
  await tx.delete(transfers).where(eq(transfers.marketId, market.id));
  await tx.insert(transfers).values(result.transfers.map((t) => ({ ...t, marketId: market.id })));
  await tx
    .update(markets)
    .set({ status: "RESOLVED", trueValue, resolvedAt: new Date() })
    .where(eq(markets.id, market.id));
}
