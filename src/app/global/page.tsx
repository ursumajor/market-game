import Link from "next/link";
import { Suspense } from "react";
import { Countdown } from "@/components/time";
import { ButtonLink, Card, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/dal";
import { fmtNumber } from "@/lib/format";
import { finalizeDueQuestions, listQuestions } from "@/lib/global";
import { bestAsk, bestBid } from "@/lib/order-book";

type Row = Awaited<ReturnType<typeof listQuestions>>[number];

function QuestionRow({ q }: { q: Row }) {
  const bid = bestBid(q.quotes);
  const ask = bestAsk(q.quotes);
  const unit = q.unit ? ` ${q.unit}` : "";
  return (
    <li>
      <Link
        href={`/global/${q.id}`}
        className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-5 py-4 transition-colors hover:border-accent"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="font-medium">{q.question}</span>
          <span className="shrink-0 font-mono text-sm tabular-nums">
            {bid === null && ask === null ? (
              <span className="text-muted">no quotes</span>
            ) : (
              <>
                <span title="Best bid: highest low">{bid === null ? "–" : fmtNumber(bid)}</span>
                <span className="text-muted"> / </span>
                <span title="Best ask: lowest high">{ask === null ? "–" : fmtNumber(ask)}</span>
                <span className="text-muted">{unit}</span>
              </>
            )}
          </span>
        </div>
        <p className="text-sm text-muted">
          {q.makerCount} {q.makerCount === 1 ? "market" : "markets"} · {q.tradeCount} {q.tradeCount === 1 ? "trade" : "trades"} · asked by{" "}
          {q.creatorName}
          {q.status === "OPEN" && !q.closed && (
            <>
              {" "}
              · <Countdown to={q.closesAt.getTime()} />
            </>
          )}
          {q.status === "RESOLVED" && q.trueValue !== null && ` · answer ${fmtNumber(q.trueValue)}${unit}`}
          {q.status === "VOID" && " · voided"}
        </p>
      </Link>
    </li>
  );
}

function Section({ title, rows, empty }: { title: string; rows: Row[]; empty?: string }) {
  if (rows.length === 0 && !empty) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{title}</SectionTitle>
      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{empty}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((q) => (
            <QuestionRow key={q.id} q={q} />
          ))}
        </ul>
      )}
    </section>
  );
}

async function GlobalView() {
  await requireUser();
  await finalizeDueQuestions();
  const questions = await listQuestions();
  const open = questions.filter((q) => q.status === "OPEN" && !q.closed);
  const awaiting = questions.filter((q) => (q.status === "OPEN" && q.closed) || q.status === "PROPOSED");
  const settled = questions.filter((q) => q.status === "RESOLVED" || q.status === "VOID").reverse();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Global markets</h1>
          <p className="text-sm text-muted">Anyone can make a market on these, and anyone can trade.</p>
        </div>
        <ButtonLink href="/global/new">Ask a question</ButtonLink>
      </div>
      <Section title="Trading now" rows={open} empty="No open questions. Ask one!" />
      <Section title="Waiting for the answer" rows={awaiting} />
      <Section title="Settled" rows={settled} />
    </div>
  );
}

export default function GlobalPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <GlobalView />
    </Suspense>
  );
}
