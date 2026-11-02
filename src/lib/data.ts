import "server-only";

import { and, asc, count, desc, eq, exists, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { groupMembers, groups, marketApprovals, markets, positions, transfers, users } from "@/db/schema";

export type Role = "ADMIN" | "MEMBER";

export async function getMyGroups(userId: string) {
  const memberCount = db
    .select({ groupId: groupMembers.groupId, n: count().as("n") })
    .from(groupMembers)
    .groupBy(groupMembers.groupId)
    .as("member_count");

  return db
    .select({
      id: groups.id,
      name: groups.name,
      memberCount: memberCount.n,
      // Head-to-head total against the other members, from every market.
      myPoints: sql<number>`coalesce((
        select sum(case when ${transfers.takerId} = ${userId} then ${transfers.points} else -${transfers.points} end)
        from ${transfers}
        where (${transfers.takerId} = ${userId} and ${transfers.makerId} in (select gm.user_id from group_members gm where gm.group_id = ${groups.id}))
           or (${transfers.makerId} = ${userId} and ${transfers.takerId} in (select gm.user_id from group_members gm where gm.group_id = ${groups.id}))
      ), 0)`,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .innerJoin(memberCount, eq(memberCount.groupId, groups.id))
    .where(eq(groupMembers.userId, userId))
    .orderBy(asc(groups.name));
}

/** The group and the user's role in it, or null if they aren't a member. */
export async function getMembership(groupId: string, userId: string) {
  const [row] = await db
    .select({ group: groups, role: groupMembers.role })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  return row ?? null;
}

export async function getMembers(groupId: string) {
  return db
    .select({ id: users.id, name: users.name, role: groupMembers.role })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(asc(users.name));
}

/** Every group the user is in, with its members, for the market form. */
export async function getMyGroupsWithMembers(userId: string) {
  const myGroups = await getMyGroups(userId);
  return Promise.all(
    myGroups.map(async (g) => ({
      id: g.id,
      name: g.name,
      members: (await getMembers(g.id)).map(({ id, name }) => ({ id, name })),
    })),
  );
}

const isPlayer = (userId: string) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(positions)
      .where(and(eq(positions.marketId, markets.id), eq(positions.userId, userId))),
  );

/** A market outside any group is visible to whoever recorded it, its MM, and its takers. */
const involves = (userId: string) => or(eq(markets.createdById, userId), eq(markets.makerId, userId), isPlayer(userId));

function listMarkets(where: SQL | undefined) {
  const maker = alias(users, "maker");
  return db
    .select({
      id: markets.id,
      question: markets.question,
      unit: markets.unit,
      status: markets.status,
      low: markets.low,
      high: markets.high,
      trueValue: markets.trueValue,
      makerId: markets.makerId,
      makerName: maker.name,
      createdAt: markets.createdAt,
      playerCount: sql<number>`(select count(*) from ${positions} where ${positions.marketId} = ${markets.id})`,
    })
    .from(markets)
    .innerJoin(maker, eq(maker.id, markets.makerId))
    .where(where)
    .orderBy(desc(markets.createdAt), desc(markets.id));
}

/** Pending markets the user was added to by someone they aren't friends with. */
export async function getMyMarketInvites(userId: string) {
  const creator = alias(users, "creator");
  return db
    .select({ id: markets.id, question: markets.question, creatorName: creator.name })
    .from(marketApprovals)
    .innerJoin(markets, eq(markets.id, marketApprovals.marketId))
    .innerJoin(creator, eq(creator.id, markets.createdById))
    .where(and(eq(marketApprovals.userId, userId), eq(marketApprovals.status, "PENDING"), eq(markets.status, "PENDING")))
    .orderBy(desc(markets.createdAt));
}

export type MarketListItem = Awaited<ReturnType<typeof listMarkets>>[number];

export const getGroupMarkets = (groupId: string) => listMarkets(eq(markets.groupId, groupId));

// Quotes on global questions live on their question's page, not here.
export const getMyUngroupedMarkets = (userId: string) =>
  listMarkets(and(isNull(markets.groupId), isNull(markets.questionId), involves(userId)));

const ledgerColumns = {
  marketId: transfers.marketId,
  makerId: transfers.makerId,
  takerId: transfers.takerId,
  points: transfers.points,
};

/**
 * Every transfer between two of these users, from any market, grouped or not.
 * A group's leaderboard is built from this with its member ids.
 */
export async function getTransfersAmong(userIds: string[]) {
  if (userIds.length < 2) return [];
  return db
    .select(ledgerColumns)
    .from(transfers)
    .where(and(inArray(transfers.makerId, userIds), inArray(transfers.takerId, userIds)));
}

/** Every transfer the user was part of: their head to head with everyone. */
export async function getMyTransfers(userId: string) {
  return db
    .select(ledgerColumns)
    .from(transfers)
    .where(or(eq(transfers.makerId, userId), eq(transfers.takerId, userId)));
}

export async function getUserNames(ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function getMarket(marketId: string) {
  const [market] = await db.select().from(markets).where(eq(markets.id, marketId));
  if (!market) return null;

  const [maker] = await db.select({ name: users.name }).from(users).where(eq(users.id, market.makerId));
  const [creator] = await db.select({ name: users.name }).from(users).where(eq(users.id, market.createdById));
  const players = await db
    .select({ userId: positions.userId, name: users.name, side: positions.side })
    .from(positions)
    .innerJoin(users, eq(users.id, positions.userId))
    .where(eq(positions.marketId, marketId))
    .orderBy(asc(users.name));
  const results = await db
    .select({ takerId: transfers.takerId, raw: transfers.raw, points: transfers.points })
    .from(transfers)
    .where(eq(transfers.marketId, marketId));
  const approvals = await db
    .select({ userId: marketApprovals.userId, name: users.name, status: marketApprovals.status })
    .from(marketApprovals)
    .innerJoin(users, eq(users.id, marketApprovals.userId))
    .where(eq(marketApprovals.marketId, marketId))
    .orderBy(asc(users.name));

  return {
    market,
    makerName: maker?.name ?? "Unknown",
    creatorName: creator?.name ?? "Unknown",
    players,
    results,
    approvals,
  };
}

/**
 * Whether the user may see and change a market, plus its group if it has one.
 * Returns null when they may not see it at all.
 *
 * Group markets: any member sees them; the recorder, the MM or an admin manages them.
 * Markets outside groups: only people involved see them; the recorder or the MM manages them.
 */
export async function getMarketAccess(
  market: { id: string; groupId: string | null; createdById: string; makerId: string },
  userId: string,
) {
  const ownsIt = market.createdById === userId || market.makerId === userId;
  if (market.groupId) {
    const membership = await getMembership(market.groupId, userId);
    if (!membership) return null;
    return { group: membership.group, canManage: ownsIt || membership.role === "ADMIN" };
  }
  if (!ownsIt) {
    const [played] = await db
      .select({ one: sql`1` })
      .from(positions)
      .where(and(eq(positions.marketId, market.id), eq(positions.userId, userId)));
    if (!played) return null;
  }
  return { group: null, canManage: ownsIt };
}
