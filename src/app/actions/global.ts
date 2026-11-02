"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/db";
import { globalQuestions, markets, positions, questionDisputes } from "@/db/schema";
import { requireUser } from "@/lib/dal";
import { parseNumber } from "@/lib/format";
import { getQuestion, resolveQuestion } from "@/lib/global";
import { DISPUTE_WINDOW_HOURS, MAX_QUESTION_DAYS, quoteBlocker, tradeBlocker, tradeSideToSide, type TradeSide } from "@/lib/order-book";
import { validateMarket, validateTrueValue } from "@/lib/scoring";

export type GlobalFormState = { errors?: string[]; message?: string } | undefined;

function revalidateQuestion(questionId: string) {
  revalidatePath(`/global/${questionId}`);
  revalidatePath("/global");
  // Trades are head to head, so resolutions show up on dashboards and group leaderboards too.
  revalidatePath("/groups/[id]", "page");
  revalidatePath("/");
}

/** Loads a question with the clock-dependent flags, or throws. */
async function loadQuestion(questionId: string) {
  const [q] = await db
    .select({
      id: globalQuestions.id,
      createdById: globalQuestions.createdById,
      question: globalQuestions.question,
      unit: globalQuestions.unit,
      status: globalQuestions.status,
      trueValue: globalQuestions.trueValue,
      closed: sql<number>`(${globalQuestions.closesAt} <= unixepoch())`.mapWith(Boolean),
      disputeOpen: sql<number>`(${globalQuestions.disputeEndsAt} > unixepoch())`.mapWith(Boolean),
    })
    .from(globalQuestions)
    .where(eq(globalQuestions.id, questionId));
  if (!q) throw new Error("That question doesn't exist.");
  return q;
}

const NewQuestion = z.object({
  question: z.string().trim().min(1, { error: "Write the question." }).max(300, { error: "Keep the question under 300 characters." }),
  unit: z.string().trim().max(30, { error: "Keep the unit under 30 characters." }),
  answerSource: z
    .string()
    .trim()
    .min(1, { error: "Say where the answer will come from, so people can check it." })
    .max(300, { error: "Keep the source under 300 characters." }),
  closesAt: z.coerce.date({ error: "Pick when trading closes." }),
});

export async function createQuestion(_state: GlobalFormState, formData: FormData): Promise<GlobalFormState> {
  const user = await requireUser();
  const parsed = NewQuestion.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const { question, unit, answerSource, closesAt } = parsed.data;

  const now = Date.now();
  if (closesAt.getTime() < now + 60_000) return { errors: ["Trading has to stay open for at least a minute."] };
  if (closesAt.getTime() > now + MAX_QUESTION_DAYS * 86_400_000) {
    return { errors: [`Trading can stay open for at most ${MAX_QUESTION_DAYS} days.`] };
  }

  const [row] = await db
    .insert(globalQuestions)
    .values({ createdById: user.id, question, unit: unit || null, answerSource, closesAt })
    .returning({ id: globalQuestions.id });
  revalidatePath("/global");
  redirect(`/global/${row.id}`);
}

/** Closes the user's current quote to new trades. Untraded quotes are deleted outright. */
async function retireMyQuote(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], questionId: string, userId: string) {
  const live = await tx
    .select({
      id: markets.id,
      tradeCount: sql<number>`(select count(*) from ${positions} where ${positions.marketId} = ${markets.id})`,
    })
    .from(markets)
    .where(and(eq(markets.questionId, questionId), eq(markets.makerId, userId), eq(markets.acceptingTrades, true)));
  for (const q of live) {
    if (q.tradeCount === 0) await tx.delete(markets).where(eq(markets.id, q.id));
    else await tx.update(markets).set({ acceptingTrades: false }).where(eq(markets.id, q.id));
  }
}

const MaxTrades = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number({ error: "The cap must be a whole number." }).int().min(1, { error: "The cap must be at least 1." }).max(10_000).nullable());

/** Posts the user's quote, replacing their previous one. Trades already made on the old quote stand. */
export async function postQuote(questionId: string, _state: GlobalFormState, formData: FormData): Promise<GlobalFormState> {
  const user = await requireUser();
  const q = await loadQuestion(questionId);
  const blocked = q.status === "OPEN" ? quoteBlocker({ userId: user.id, creatorId: q.createdById, closed: q.closed }) : "Trading on this question has closed.";
  if (blocked) return { errors: [blocked] };

  const low = parseNumber(formData.get("low"));
  const high = parseNumber(formData.get("high"));
  // validateMarket also wants a taker; a fresh quote has none yet, so check the range alone.
  const errors = validateMarket({ makerId: user.id, low, high, positions: [{ userId: "-", side: "HIGHER" }] });
  const cap = MaxTrades.safeParse(String(formData.get("maxTrades") ?? ""));
  if (!cap.success) errors.push(cap.error.issues[0].message);
  if (errors.length > 0) return { errors };

  await db.transaction(async (tx) => {
    await retireMyQuote(tx, questionId, user.id);
    await tx.insert(markets).values({
      questionId,
      createdById: user.id,
      makerId: user.id,
      question: q.question,
      unit: q.unit,
      low,
      high,
      maxTrades: cap.data,
    });
  });
  revalidateQuestion(questionId);
  return { message: "Your market is live." };
}

export async function withdrawQuote(questionId: string) {
  const user = await requireUser();
  await db.transaction((tx) => retireMyQuote(tx, questionId, user.id));
  revalidateQuestion(questionId);
}

/**
 * Trades one quote: BUY at its high or SELL at its low. Every rule is checked
 * inside a single INSERT ... SELECT, so a quote that's withdrawn, fills up or
 * closes at the same moment can't be traded in a race.
 */
export async function trade(quoteId: string, side: TradeSide): Promise<GlobalFormState> {
  const user = await requireUser();
  const result = await db.run(sql`
    insert into ${positions} (market_id, user_id, side)
    select m.id, ${user.id}, ${tradeSideToSide(side)}
    from ${markets} m
    join ${globalQuestions} g on g.id = m.question_id
    where m.id = ${quoteId}
      and m.accepting_trades = 1
      and m.maker_id != ${user.id}
      and g.created_by_id != ${user.id}
      and g.status = 'OPEN'
      and g.closes_at > unixepoch()
      and (m.max_trades is null or (select count(*) from ${positions} p where p.market_id = m.id) < m.max_trades)
    on conflict do nothing
  `);

  const [quote] = await db.select().from(markets).where(eq(markets.id, quoteId));
  if (!quote?.questionId) return { errors: ["That quote doesn't exist."] };
  if (result.rowsAffected === 0) {
    // Work out why for the message; the insert above is what actually enforced it.
    const q = await loadQuestion(quote.questionId);
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(positions).where(eq(positions.marketId, quoteId));
    const [mine] = await db
      .select({ one: sql`1` })
      .from(positions)
      .where(and(eq(positions.marketId, quoteId), eq(positions.userId, user.id)));
    const reason = tradeBlocker(
      { ...quote, tradeCount: n },
      { userId: user.id, creatorId: q.createdById, closed: q.closed || q.status !== "OPEN", tradedQuoteIds: new Set(mine ? [quoteId] : []) },
    );
    return { errors: [reason ?? "That trade didn't go through. Try again."] };
  }
  revalidateQuestion(quote.questionId);
  return undefined;
}

/** The creator proposes the answer once trading has closed; it becomes final after the dispute window. */
export async function proposeAnswer(questionId: string, _state: GlobalFormState, formData: FormData): Promise<GlobalFormState> {
  const user = await requireUser();
  const q = await loadQuestion(questionId);
  if (q.createdById !== user.id) return { errors: ["Only the person who asked can enter the answer."] };
  if (!q.closed) return { errors: ["Wait until trading closes."] };
  if (q.status !== "OPEN" && q.status !== "PROPOSED") return { errors: ["This question is already settled."] };

  const trueValue = parseNumber(formData.get("trueValue"));
  const errors = validateTrueValue(trueValue);
  if (errors.length > 0) return { errors };

  await db.transaction(async (tx) => {
    // A new answer starts a new window, and disputes about the old one no longer apply.
    await tx.delete(questionDisputes).where(eq(questionDisputes.questionId, questionId));
    await tx
      .update(globalQuestions)
      .set({ status: "PROPOSED", trueValue, disputeEndsAt: new Date(Date.now() + DISPUTE_WINDOW_HOURS * 3_600_000) })
      .where(eq(globalQuestions.id, questionId));
  });
  revalidateQuestion(questionId);
  return undefined;
}

export async function disputeAnswer(questionId: string, _state: GlobalFormState, formData: FormData): Promise<GlobalFormState> {
  const user = await requireUser();
  const q = await loadQuestion(questionId);
  if (q.status !== "PROPOSED" || !q.disputeOpen) return { errors: ["There's no proposed answer open to dispute."] };
  const data = await getQuestion(questionId, user.id);
  if (!data?.isParticipant) return { errors: ["Only people who made a market or traded can dispute."] };

  const reason = z.string().trim().min(1, { error: "Say what's wrong with the answer." }).max(300).safeParse(formData.get("reason"));
  if (!reason.success) return { errors: [reason.error.issues[0].message] };

  await db.insert(questionDisputes).values({ questionId, userId: user.id, reason: reason.data }).onConflictDoNothing();
  // The page then lists the dispute in place of the form.
  revalidateQuestion(questionId);
  return undefined;
}

/** After the window, the creator can confirm a disputed answer (undisputed ones finalize on their own). */
export async function confirmAnswer(questionId: string) {
  const user = await requireUser();
  const q = await loadQuestion(questionId);
  if (q.createdById !== user.id || q.status !== "PROPOSED" || q.disputeOpen || q.trueValue === null) {
    throw new Error("This answer can't be confirmed yet.");
  }
  const trueValue = q.trueValue;
  await db.transaction((tx) => resolveQuestion(tx, questionId, trueValue));
  revalidateQuestion(questionId);
}

/** Cancels the question: nobody scores from it. */
export async function voidQuestion(questionId: string) {
  const user = await requireUser();
  const q = await loadQuestion(questionId);
  if (q.createdById !== user.id || q.status === "RESOLVED") throw new Error("You can't void this question.");
  await db.transaction(async (tx) => {
    await tx.update(markets).set({ status: "VOID", acceptingTrades: false }).where(eq(markets.questionId, questionId));
    await tx.update(globalQuestions).set({ status: "VOID" }).where(eq(globalQuestions.id, questionId));
  });
  revalidateQuestion(questionId);
}
