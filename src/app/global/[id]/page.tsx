import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { confirmAnswer, disputeAnswer, postQuote, proposeAnswer, trade, voidQuestion, withdrawQuote } from "@/app/actions/global";
import { ActionButton } from "@/components/action-button";
import { AudienceTag } from "@/components/audience-tag";
import { Countdown, LocalTime } from "@/components/time";
import { Card, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/dal";
import { fmtNumber, fmtPoints, pointsClass } from "@/lib/format";
import { finalizeDueQuestions, getQuestion } from "@/lib/global";
import { totals } from "@/lib/ledger";
import { bestAsk, bestBid, isCrossed, tradeBlocker, type Quote } from "@/lib/order-book";
import { InlineForm, MyTrades, QuoteForm, TradeButtons } from "./controls";

type Data = NonNullable<Awaited<ReturnType<typeof getQuestion>>>;

function phaseLabel(q: Data["question"]) {
  if (q.status === "OPEN") return q.closed ? "Closed" : "Trading";
  if (q.status === "PROPOSED") return q.trueValue === null ? "Void proposed" : "Answer proposed";
  return { RESOLVED: "Resolved", VOID: "Void" }[q.status];
}

/** Links only plain http(s) URLs; anything else is shown as text. */
function Source({ text }: { text: string }) {
  if (!/^https?:\/\/\S+$/i.test(text)) return <span>{text}</span>;
  return (
    <a href={text} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
      {text}
    </a>
  );
}

function OrderBook({ data, userId, unit }: { data: Data; userId: string; unit: string }) {
  const { question: q, quotes, trades } = data;
  const live = quotes.filter((x) => x.acceptingTrades);
  const ctx = {
    userId,
    closed: q.status !== "OPEN" || q.closed,
    tradedQuoteIds: new Set(trades.filter((t) => t.takerId === userId).map((t) => t.quoteId)),
  };
  const bid = bestBid(live as Quote[]);
  const ask = bestAsk(live as Quote[]);

  if (live.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">No markets yet.{!ctx.closed && " Be the first to make one."}</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-0 p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3 text-sm">
        <span>
          Best bid <span className="font-mono font-semibold tabular-nums">{bid === null ? "–" : fmtNumber(bid)}</span>
          <span className="text-muted"> · </span>
          best ask <span className="font-mono font-semibold tabular-nums">{ask === null ? "–" : fmtNumber(ask)}</span>
          <span className="text-muted">{unit}</span>
        </span>
        {isCrossed(live as Quote[]) && <span className="text-gain">Quotes cross: buy low, sell high for a sure profit</span>}
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {live.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="flex flex-col">
              <span>
                {x.makerName}
                {x.makerId === userId && <span className="text-muted"> (you)</span>}
              </span>
              <span className="text-sm text-muted">
                <span className="font-mono tabular-nums">
                  {fmtNumber(x.low)} – {fmtNumber(x.high)}
                </span>
                {unit} · {x.tradeCount}
                {x.maxTrades !== null && `/${x.maxTrades}`} {x.tradeCount === 1 && x.maxTrades === null ? "trade" : "trades"}
              </span>
            </div>
            <TradeButtons
              buy={trade.bind(null, x.id, "BUY")}
              sell={trade.bind(null, x.id, "SELL")}
              low={x.low}
              high={x.high}
              blocker={tradeBlocker(x as Quote, ctx)}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Resolution({ data, userId, unit }: { data: Data; userId: string; unit: string }) {
  const { question: q, disputes, isParticipant } = data;
  const isCreator = q.createdById === userId;
  const canPropose = isCreator && q.closed && (q.status === "OPEN" || q.status === "PROPOSED");
  if (!canPropose && q.status !== "PROPOSED") return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>Answer</SectionTitle>
      {q.status === "PROPOSED" && q.disputeEndsAt && (
        <Card className="flex flex-col gap-3">
          <p>
            {q.trueValue === null ? (
              <>{q.creatorName} wants to void this question, so nobody would score. Since they have trades on it, others can object.</>
            ) : (
              <>
                {q.creatorName} says the answer is{" "}
                <span className="font-mono font-semibold tabular-nums">
                  {fmtNumber(q.trueValue)}
                  {unit}
                </span>
                .
              </>
            )}{" "}
            {q.disputeOpen ? (
              <span className="text-muted">
                Final <LocalTime at={q.disputeEndsAt.getTime()} /> (<Countdown to={q.disputeEndsAt.getTime()} done="any moment" />) unless
                someone disputes it.
              </span>
            ) : (
              <span className="text-muted">The dispute window has closed.</span>
            )}
          </p>
          {disputes.length > 0 && q.status === "PROPOSED" && (
            <ul className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
              {disputes.map((d) => (
                <li key={d.userId}>
                  <span className="font-medium">{d.userId === userId ? "You" : d.name}</span> {d.userId === userId ? "dispute" : "disputes"}:{" "}
                  {d.reason}
                </li>
              ))}
            </ul>
          )}
          {isParticipant && !isCreator && q.disputeOpen && !disputes.some((d) => d.userId === userId) && (
            <InlineForm
              action={disputeAnswer.bind(null, q.id)}
              name="reason"
              label={q.trueValue === null ? "Why shouldn't it be voided?" : "What's wrong with the answer?"}
              placeholder={q.trueValue === null ? "Why shouldn't it be voided?" : "What's wrong with it? Link the right answer if you can."}
              submitLabel="Dispute"
            />
          )}
          {isCreator && !q.disputeOpen && disputes.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
              <span className="text-muted">
                It was disputed, so it won&apos;t finalize on its own. {q.closed && "Enter an answer below, or confirm it."}
                {!q.closed && "Confirm it, or wait until trading's closing time to enter an answer instead."}
              </span>
              <ActionButton
                action={confirmAnswer.bind(null, q.id)}
                label={q.trueValue === null ? "Confirm voiding" : "Confirm answer"}
                variant="primary"
                confirmText={
                  q.trueValue === null
                    ? "Void this question despite the objections? Nobody scores."
                    : "Confirm this answer despite the disputes? Everyone is scored with it."
                }
              />
            </div>
          )}
        </Card>
      )}
      {canPropose && (
        <Card className="flex flex-col gap-2">
          <p className="text-sm font-medium">{q.status === "PROPOSED" && q.trueValue !== null ? "Change the answer" : "Enter the answer"}</p>
          <InlineForm
            action={proposeAnswer.bind(null, q.id)}
            name="trueValue"
            label="The true answer"
            placeholder="The true answer"
            submitLabel={q.status === "PROPOSED" && q.trueValue !== null ? "Change" : "Submit"}
            numeric
          />
          <p className="text-sm text-muted">
            Participants then have a day to dispute it. A new answer restarts that window.
          </p>
        </Card>
      )}
    </section>
  );
}

function Results({ data, userId }: { data: Data; userId: string }) {
  const net = totals(data.results);
  const names = new Map<string, string>();
  for (const t of data.trades) {
    names.set(t.takerId, t.takerName);
    names.set(t.makerId, t.makerName);
  }
  const rows = [...net].map(([id, points]) => ({ id, name: names.get(id) ?? "?", points })).sort((a, b) => b.points - a.points);
  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">Nobody traded, so nobody scored.</p>
      </Card>
    );
  }
  return (
    <Card className="p-0">
      <ul className="flex flex-col divide-y divide-border text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between px-5 py-3">
            <span>
              {r.name}
              {r.id === userId && <span className="text-muted"> (you)</span>}
            </span>
            <span className={`font-mono tabular-nums ${pointsClass(r.points)}`}>{fmtPoints(r.points)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function QuestionView({ params }: { params: PageProps<"/global/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  await finalizeDueQuestions();
  const data = await getQuestion(id, user.id);
  if (!data) notFound();

  const { question: q, quotes, trades } = data;
  const unit = q.unit ? ` ${q.unit}` : "";
  const isCreator = q.createdById === user.id;
  const back = q.audience === "GROUP" && q.groupId ? { href: `/groups/${q.groupId}`, label: q.groupName } : { href: "/global", label: "Online markets" };
  const tradingOpen = q.status === "OPEN" && !q.closed;
  const myQuote = quotes.find((x) => x.acceptingTrades && x.makerId === user.id) ?? null;
  const myTrades = trades.filter((t) => t.takerId === user.id || t.makerId === user.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={back.href} className="text-sm text-muted hover:text-foreground">
          ← {back.label}
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">{q.question}</h1>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <AudienceTag audience={q.audience} groupName={q.groupName} creatorName={q.creatorName} />
            <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium">{phaseLabel(q)}</span>
          </div>
        </div>
        <p className="text-sm text-muted">
          Asked by {q.creatorName}
          {tradingOpen && (
            <>
              {" "}
              · closes <LocalTime at={q.closesAt.getTime()} /> (<Countdown to={q.closesAt.getTime()} />)
            </>
          )}
        </p>
        <p className="text-sm text-muted">
          Answer from: <Source text={q.answerSource} />
        </p>
      </div>

      {q.status === "RESOLVED" && q.trueValue !== null && (
        <section className="flex flex-col gap-3">
          <SectionTitle>
            Answer: {fmtNumber(q.trueValue)}
            {unit}
          </SectionTitle>
          <Results data={data} userId={user.id} />
        </section>
      )}
      {q.status === "VOID" && (
        <Card>
          <p className="text-sm text-muted">This question was voided, so nobody scored anything.</p>
        </Card>
      )}

      <Resolution data={data} userId={user.id} unit={unit} />

      {q.status !== "RESOLVED" && q.status !== "VOID" && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Markets</SectionTitle>
          <OrderBook data={data} userId={user.id} unit={unit} />
        </section>
      )}

      {tradingOpen && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Your market</SectionTitle>
          <Card className="flex flex-col gap-3">
            <QuoteForm
              post={postQuote.bind(null, q.id)}
              current={myQuote && { low: myQuote.low, high: myQuote.high, maxTrades: myQuote.maxTrades }}
            />
            {myQuote && (
              <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-sm text-muted">
                <span>Updating or withdrawing keeps trades already made at your old prices.</span>
                <ActionButton action={withdrawQuote.bind(null, q.id)} label="Withdraw" confirmText="Stop taking trades on your market?" />
              </div>
            )}
          </Card>
        </section>
      )}

      {myTrades.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Your trades</SectionTitle>
          <Card>
            <MyTrades trades={myTrades} meId={user.id} unit={unit} />
          </Card>
        </section>
      )}

      {isCreator && q.status !== "RESOLVED" && q.status !== "VOID" && !(q.status === "PROPOSED" && q.trueValue === null) && (
        <div className="flex justify-end">
          <ActionButton
            action={voidQuestion.bind(null, q.id)}
            label="Void question"
            confirmText={
              myTrades.length > 0
                ? "Propose voiding this question? Trading stops now. Since you have trades on it, others get a day to object; if nobody does, every trade is cancelled."
                : "Void this question? Every trade on it is cancelled and nobody scores."
            }
          />
        </div>
      )}
    </div>
  );
}

export default function QuestionPage(props: PageProps<"/global/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <QuestionView params={props.params} />
    </Suspense>
  );
}
