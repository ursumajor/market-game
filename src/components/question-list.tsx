import Link from "next/link";
import { AudienceTag } from "@/components/audience-tag";
import { Countdown } from "@/components/time";
import { Card, SectionTitle } from "@/components/ui";
import { fmtNumber } from "@/lib/format";
import type { listQuestions } from "@/lib/global";
import { bestAsk, bestBid } from "@/lib/order-book";

export type QuestionRowData = Awaited<ReturnType<typeof listQuestions>>[number];

function QuestionRow({ q }: { q: QuestionRowData }) {
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
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{q.question}</span>
            <AudienceTag audience={q.audience} groupName={q.groupName} creatorName={q.creatorName} />
          </span>
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

export function QuestionSection({ title, rows, empty }: { title: string; rows: QuestionRowData[]; empty?: string }) {
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
