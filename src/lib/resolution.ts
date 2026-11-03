import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { markets, positions, transfers } from "@/db/schema";
import { scoreMarket, type Position, type Transfer } from "./scoring";

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
  await writeTransfers(tx, market.id, result.transfers, trueValue);
}

/** Replaces a market's transfers with already-scored ones and marks it resolved. */
export async function writeTransfers(tx: Tx, marketId: string, scored: Transfer[], trueValue: number) {
  await tx.delete(transfers).where(eq(transfers.marketId, marketId));
  if (scored.length > 0) {
    await tx.insert(transfers).values(scored.map(({ makerId, takerId, raw, points }) => ({ makerId, takerId, raw, points, marketId })));
  }
  await tx
    .update(markets)
    .set({ status: "RESOLVED", trueValue, resolvedAt: new Date() })
    .where(eq(markets.id, marketId));
}
