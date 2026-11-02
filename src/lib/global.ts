import "server-only";

import { and, asc, eq, getTableColumns, inArray, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { friendships, globalQuestions, groupMembers, groups, markets, positions, questionDisputes, questionInvitees, transfers, users } from "@/db/schema";
import type { Quote, TradeSide } from "./order-book";
import { getPositions, writeResolution, type Tx } from "./resolution";

// Whether trading has closed is decided in SQL: reading the clock during a
// render is rejected by Cache Components.
const isClosed = sql<number>`(${globalQuestions.closesAt} <= unixepoch())`.mapWith(Boolean);

/**
 * Whether `userId` can see the question in the current row of global_questions:
 * it's public, theirs, shared with them (as the creator's friend, a member of its
 * group, or hand-picked), or they've already made a market or traded on it.
 */
export function canSeeQuestion(userId: string) {
  const g = globalQuestions;
  return sql<boolean>`(
    ${g.audience} = 'EVERYONE'
    or ${g.createdById} = ${userId}
    or (${g.audience} = 'FRIENDS' and exists (
      select 1 from ${friendships} f where f.status = 'ACCEPTED'
        and ((f.requester_id = ${g.createdById} and f.addressee_id = ${userId})
          or (f.addressee_id = ${g.createdById} and f.requester_id = ${userId}))))
    or (${g.audience} = 'GROUP' and exists (
      select 1 from ${groupMembers} gm where gm.group_id = ${g.groupId} and gm.user_id = ${userId}))
    or (${g.audience} = 'PEOPLE' and exists (
      select 1 from ${questionInvitees} qi where qi.question_id = ${g.id} and qi.user_id = ${userId}))
    or exists (
      select 1 from ${markets} qm where qm.question_id = ${g.id}
        and (qm.maker_id = ${userId} or exists (select 1 from ${positions} qp where qp.market_id = qm.id and qp.user_id = ${userId})))
  )`;
}

const quoteColumns = {
  id: markets.id,
  questionId: markets.questionId,
  makerId: markets.makerId,
  low: markets.low,
  high: markets.high,
  acceptingTrades: markets.acceptingTrades,
  maxTrades: markets.maxTrades,
  tradeCount: sql<number>`(select count(*) from ${positions} where ${positions.marketId} = ${markets.id})`,
};

/** Every quote (live or not) on these questions, with its MM's name. */
async function getQuotes(questionIds: string[]) {
  if (questionIds.length === 0) return [];
  const maker = alias(users, "maker");
  return db
    .select({ ...quoteColumns, makerName: maker.name, makerUsername: maker.username })
    .from(markets)
    .innerJoin(maker, eq(maker.id, markets.makerId))
    .where(inArray(markets.questionId, questionIds))
    .orderBy(asc(sql`${markets.high} - ${markets.low}`), asc(markets.createdAt));
}

export type QuoteRow = Awaited<ReturnType<typeof getQuotes>>[number];

/** The questions `userId` can see, optionally only one group's. */
export async function listQuestions(userId: string, { groupId }: { groupId?: string } = {}) {
  const creator = alias(users, "creator");
  const questions = await db
    .select({
      id: globalQuestions.id,
      question: globalQuestions.question,
      unit: globalQuestions.unit,
      status: globalQuestions.status,
      closesAt: globalQuestions.closesAt,
      closed: isClosed,
      trueValue: globalQuestions.trueValue,
      createdById: globalQuestions.createdById,
      creatorName: creator.name,
      audience: globalQuestions.audience,
      groupName: groups.name,
    })
    .from(globalQuestions)
    .innerJoin(creator, eq(creator.id, globalQuestions.createdById))
    .leftJoin(groups, eq(groups.id, globalQuestions.groupId))
    .where(and(canSeeQuestion(userId), groupId ? eq(globalQuestions.groupId, groupId) : undefined))
    .orderBy(asc(globalQuestions.closesAt))
    .limit(200);

  const quotes = await getQuotes(questions.map((q) => q.id));
  return questions.map((q) => {
    const mine = quotes.filter((x) => x.questionId === q.id);
    return {
      ...q,
      quotes: mine as Quote[],
      makerCount: new Set(mine.filter((x) => x.acceptingTrades).map((x) => x.makerId)).size,
      tradeCount: mine.reduce((n, x) => n + x.tradeCount, 0),
    };
  });
}

export async function getQuestion(questionId: string, userId: string) {
  const creator = alias(users, "creator");
  const [question] = await db
    .select({
      ...getTableColumns(globalQuestions),
      closed: isClosed,
      disputeOpen: sql<number>`(${globalQuestions.disputeEndsAt} > unixepoch())`.mapWith(Boolean),
      creatorName: creator.name,
      groupName: groups.name,
    })
    .from(globalQuestions)
    .innerJoin(creator, eq(creator.id, globalQuestions.createdById))
    .leftJoin(groups, eq(groups.id, globalQuestions.groupId))
    .where(and(eq(globalQuestions.id, questionId), canSeeQuestion(userId)));
  if (!question) return null;

  const quotes = await getQuotes([questionId]);
  const quoteIds = quotes.map((q) => q.id);
  const taker = alias(users, "taker");
  const trades =
    quoteIds.length === 0
      ? []
      : await db
          .select({
            quoteId: positions.marketId,
            takerId: positions.userId,
            takerName: taker.name,
            side: sql<TradeSide>`case ${positions.side} when 'HIGHER' then 'BUY' else 'SELL' end`,
          })
          .from(positions)
          .innerJoin(taker, eq(taker.id, positions.userId))
          .where(inArray(positions.marketId, quoteIds));
  const results =
    quoteIds.length === 0
      ? []
      : await db
          .select({ quoteId: transfers.marketId, takerId: transfers.takerId, makerId: transfers.makerId, points: transfers.points })
          .from(transfers)
          .where(inArray(transfers.marketId, quoteIds));
  const disputes = await db
    .select({ userId: questionDisputes.userId, name: users.name, reason: questionDisputes.reason })
    .from(questionDisputes)
    .innerJoin(users, eq(users.id, questionDisputes.userId))
    .where(eq(questionDisputes.questionId, questionId))
    .orderBy(asc(questionDisputes.createdAt));

  const quoteById = new Map(quotes.map((q) => [q.id, q]));
  const fullTrades = trades.map((t) => {
    const q = quoteById.get(t.quoteId)!;
    return { ...t, makerId: q.makerId, makerName: q.makerName, low: q.low, high: q.high };
  });
  const isParticipant = quotes.some((q) => q.makerId === userId) || trades.some((t) => t.takerId === userId);

  return { question, quotes, trades: fullTrades, results, disputes, isParticipant };
}

/** Resolves every quote on the question at `trueValue`: traded quotes are scored, untraded ones voided. */
export async function resolveQuestion(tx: Tx, questionId: string, trueValue: number) {
  const quotes = await tx.select().from(markets).where(eq(markets.questionId, questionId));
  for (const quote of quotes) {
    const quotePositions = await getPositions(tx, quote.id);
    if (quotePositions.length > 0) {
      await writeResolution(tx, quote, quotePositions, trueValue);
    } else {
      await tx.update(markets).set({ status: "VOID", acceptingTrades: false }).where(eq(markets.id, quote.id));
    }
  }
  await tx
    .update(globalQuestions)
    .set({ status: "RESOLVED", resolvedAt: new Date() })
    .where(eq(globalQuestions.id, questionId));
}

/** Cancels the question: every quote is voided and nobody scores. */
export async function voidQuestionTx(tx: Tx, questionId: string) {
  await tx.update(markets).set({ status: "VOID", acceptingTrades: false }).where(eq(markets.questionId, questionId));
  await tx.update(globalQuestions).set({ status: "VOID" }).where(eq(globalQuestions.id, questionId));
}

/**
 * Finalizes proposals (an answer, or voiding when trueValue is null) whose
 * dispute window has passed without a dispute.
 * Called lazily whenever global pages load, so there's no background job; it's
 * idempotent, so running it on every load is safe.
 */
export async function finalizeDueQuestions() {
  const due = await db
    .select({ id: globalQuestions.id, trueValue: globalQuestions.trueValue })
    .from(globalQuestions)
    .where(
      and(
        eq(globalQuestions.status, "PROPOSED"),
        sql`${globalQuestions.disputeEndsAt} <= unixepoch()`,
        notExists(db.select({ one: sql`1` }).from(questionDisputes).where(eq(questionDisputes.questionId, globalQuestions.id))),
      ),
    );
  for (const q of due) {
    await db.transaction(async (tx) => {
      // Re-check inside the transaction so two simultaneous page loads can't both resolve it.
      const [still] = await tx
        .select({ status: globalQuestions.status })
        .from(globalQuestions)
        .where(eq(globalQuestions.id, q.id));
      if (still?.status !== "PROPOSED") return;
      if (q.trueValue === null) await voidQuestionTx(tx, q.id);
      else await resolveQuestion(tx, q.id, q.trueValue);
    });
  }
  return due.length;
}

