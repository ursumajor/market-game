"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/db";
import { marketApprovals, markets, positions, transfers } from "@/db/schema";
import { requireUser } from "@/lib/dal";
import { getMarketAccess, getMembers, getMembership, getUserNames } from "@/lib/data";
import { findUserByIdentifier, getFriendIds } from "@/lib/friends";
import { parseNumber } from "@/lib/format";
import { scoreMarket, validateMarket, validateTrueValue, type Position } from "@/lib/scoring";

export type MarketFormState = { errors?: string[] } | undefined;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const getPositions = (tx: Tx | typeof db, marketId: string) =>
  tx.select({ userId: positions.userId, side: positions.side }).from(positions).where(eq(positions.marketId, marketId));

/** Replaces a market's transfers with freshly scored ones and marks it resolved. */
async function writeResolution(
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

/**
 * Moves a PENDING market on once nobody's approval is outstanding: straight to
 * RESOLVED if an answer was already recorded, otherwise to OPEN.
 */
async function settleIfApproved(tx: Tx, marketId: string) {
  const [market] = await tx.select().from(markets).where(eq(markets.id, marketId));
  if (!market || market.status !== "PENDING") return;
  const [waiting] = await tx
    .select({ userId: marketApprovals.userId })
    .from(marketApprovals)
    .where(and(eq(marketApprovals.marketId, marketId), eq(marketApprovals.status, "PENDING")));
  if (waiting) return;

  if (market.trueValue === null) {
    await tx.update(markets).set({ status: "OPEN" }).where(eq(markets.id, marketId));
  } else {
    await writeResolution(tx, market, await getPositions(tx, marketId), market.trueValue);
  }
}

const NewMarket = z.object({
  // Empty means the market isn't in a group.
  groupId: z.string().transform((v) => v || null),
  question: z.string().trim().min(1, { error: "Write the question." }).max(300, { error: "Keep the question under 300 characters." }),
  unit: z.string().trim().max(30, { error: "Keep the unit under 30 characters." }),
  makerId: z.string().min(1, { error: "Pick the market maker." }),
  positions: z.array(z.object({ userId: z.string(), side: z.enum(["HIGHER", "LOWER"]) })),
});

export async function createMarket(_state: MarketFormState, formData: FormData): Promise<MarketFormState> {
  const user = await requireUser();

  let positionsInput: unknown;
  try {
    positionsInput = JSON.parse(String(formData.get("positions") ?? "[]"));
  } catch {
    return { errors: ["Couldn't read the players' sides. Try again."] };
  }
  const parsed = NewMarket.safeParse({
    groupId: formData.get("groupId") ?? "",
    question: formData.get("question"),
    unit: formData.get("unit") ?? "",
    makerId: formData.get("makerId") ?? "",
    positions: positionsInput,
  });
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const input = parsed.data;

  const playerIds = [...new Set([input.makerId, ...input.positions.map((p) => p.userId)])];
  // Group members joined the group themselves; anyone else the recorder isn't friends with must accept.
  let needApproval: string[] = [];
  if (input.groupId) {
    if (!(await getMembership(input.groupId, user.id))) return { errors: ["You're not a member of this group."] };
    const memberIds = new Set((await getMembers(input.groupId)).map((m) => m.id));
    if (!playerIds.every((id) => memberIds.has(id))) return { errors: ["Every player must be a member of the group."] };
  } else {
    if ((await getUserNames(playerIds)).size !== playerIds.length) {
      return { errors: ["One of the players no longer has an account."] };
    }
    const friendIds = await getFriendIds(user.id);
    needApproval = playerIds.filter((id) => id !== user.id && !friendIds.has(id));
  }

  const low = parseNumber(formData.get("low"));
  const high = parseNumber(formData.get("high"));
  const errors = validateMarket({ makerId: input.makerId, low, high, positions: input.positions });
  const trueValueInput = String(formData.get("trueValue") ?? "").trim();
  const trueValue = trueValueInput === "" ? null : parseNumber(trueValueInput);
  if (trueValue !== null) errors.push(...validateTrueValue(trueValue));
  if (errors.length > 0) return { errors };

  const marketId = await db.transaction(async (tx) => {
    const pending = needApproval.length > 0;
    const [market] = await tx
      .insert(markets)
      .values({
        groupId: input.groupId,
        createdById: user.id,
        question: input.question,
        unit: input.unit || null,
        makerId: input.makerId,
        low,
        high,
        status: pending ? "PENDING" : "OPEN",
        // Kept for later: a pending market resolves with it once everyone accepts.
        trueValue: pending ? trueValue : null,
      })
      .returning();
    await tx.insert(positions).values(input.positions.map((p) => ({ ...p, marketId: market.id })));
    if (pending) {
      await tx.insert(marketApprovals).values(needApproval.map((userId) => ({ marketId: market.id, userId })));
    } else if (trueValue !== null) {
      await writeResolution(tx, market, input.positions, trueValue);
    }
    return market.id;
  });
  revalidateMarket({ id: marketId });
  redirect(`/markets/${marketId}`);
}

/**
 * Re-renders every page that can show this market or its points. revalidatePath rather
 * than refresh(): in testing, refresh() didn't update a fully loaded page.
 */
function revalidateMarket(market: { id: string }) {
  revalidatePath(`/markets/${market.id}`);
  // Points count in every group both players share, whatever group (if any) the market is in.
  revalidatePath("/groups/[id]", "page");
  revalidatePath("/");
}

/** Loads a market for a mutation, or throws if the current user may not manage it. */
async function loadManageable(marketId: string) {
  const user = await requireUser();
  const [market] = await db.select().from(markets).where(eq(markets.id, marketId));
  const access = market && (await getMarketAccess(market, user.id));
  if (!market || !access?.canManage) {
    throw new Error("You can't change this market.");
  }
  return market;
}

export async function resolveMarket(marketId: string, _state: MarketFormState, formData: FormData): Promise<MarketFormState> {
  const market = await loadManageable(marketId);
  const trueValue = parseNumber(formData.get("trueValue"));
  const errors = validateTrueValue(trueValue);
  if (errors.length > 0) return { errors };

  if (market.status === "PENDING") {
    // Recorded now, applied when the last invitee accepts.
    await db.update(markets).set({ trueValue }).where(eq(markets.id, marketId));
  } else {
    const marketPositions = await getPositions(db, marketId);
    await db.transaction((tx) => writeResolution(tx, market, marketPositions, trueValue));
  }
  revalidateMarket(market);
  return undefined;
}

/** Puts a resolved or voided market back to open (or pending, if invites are outstanding), removing its points. */
export async function reopenMarket(marketId: string) {
  const market = await loadManageable(marketId);
  await db.transaction(async (tx) => {
    await tx.delete(transfers).where(eq(transfers.marketId, marketId));
    const [waiting] = await tx
      .select({ userId: marketApprovals.userId })
      .from(marketApprovals)
      .where(and(eq(marketApprovals.marketId, marketId), eq(marketApprovals.status, "PENDING")));
    await tx
      .update(markets)
      .set({ status: waiting ? "PENDING" : "OPEN", trueValue: null, resolvedAt: null })
      .where(eq(markets.id, marketId));
  });
  revalidateMarket(market);
}

/** Keeps the market on record but scores nobody. */
export async function voidMarket(marketId: string) {
  const market = await loadManageable(marketId);
  await db.transaction(async (tx) => {
    await tx.delete(transfers).where(eq(transfers.marketId, marketId));
    await tx.update(markets).set({ status: "VOID", trueValue: null, resolvedAt: null }).where(eq(markets.id, marketId));
  });
  revalidateMarket(market);
}

export async function deleteMarket(marketId: string) {
  const market = await loadManageable(marketId);
  await db.transaction(async (tx) => {
    await tx.delete(transfers).where(eq(transfers.marketId, marketId));
    await tx.delete(marketApprovals).where(eq(marketApprovals.marketId, marketId));
    await tx.delete(positions).where(eq(positions.marketId, marketId));
    await tx.delete(markets).where(eq(markets.id, marketId));
  });
  revalidateMarket(market);
  redirect(market.groupId ? `/groups/${market.groupId}` : "/");
}

/**
 * Answers an invite to a market from someone the user isn't friends with.
 * Declining removes them as a taker; if they were the MM, the market is voided.
 */
export async function respondToMarketInvite(marketId: string, accept: boolean) {
  const user = await requireUser();
  const [market] = await db.select().from(markets).where(eq(markets.id, marketId));
  const mine = and(eq(marketApprovals.marketId, marketId), eq(marketApprovals.userId, user.id));
  const [approval] = await db.select().from(marketApprovals).where(mine);
  if (!market || market.status !== "PENDING" || approval?.status !== "PENDING") {
    throw new Error("There's no invite to answer for this market.");
  }

  await db.transaction(async (tx) => {
    if (accept) {
      await tx.update(marketApprovals).set({ status: "ACCEPTED" }).where(mine);
      await settleIfApproved(tx, marketId);
    } else if (market.makerId === user.id) {
      // Without its MM there's no market. The invite stays, so reopening asks again.
      await tx.update(markets).set({ status: "VOID" }).where(eq(markets.id, marketId));
    } else {
      await tx.delete(marketApprovals).where(mine);
      await tx.delete(positions).where(and(eq(positions.marketId, marketId), eq(positions.userId, user.id)));
      if ((await getPositions(tx, marketId)).length === 0) {
        await tx.update(markets).set({ status: "VOID" }).where(eq(markets.id, marketId));
      } else {
        await settleIfApproved(tx, marketId);
      }
    }
  });
  revalidateMarket(market);
  // A decliner who was only a taker can't see the market any more.
  if (!accept && market.makerId !== user.id && market.createdById !== user.id) redirect("/");
}

export type FindPlayerResult = { player?: { id: string; name: string; username: string; isFriend: boolean }; error?: string };

/** Looks up an account by username or email so it can be added to a market outside a group. */
export async function findPlayer(identifier: string): Promise<FindPlayerResult> {
  const me = await requireUser();
  const player = await findUserByIdentifier(identifier);
  if (!player) {
    return {
      error: identifier.includes("@") && !identifier.trim().startsWith("@")
        ? "Nobody has an account with that email yet."
        : "No one has that username.",
    };
  }
  const isFriend = player.id === me.id || (await getFriendIds(me.id)).has(player.id);
  return { player: { ...player, isFriend } };
}
