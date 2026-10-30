import Link from "next/link";
import { Card, StatusBadge } from "@/components/ui";
import type { MarketListItem } from "@/lib/data";
import { fmtDate, fmtNumber } from "@/lib/format";

export function MarketList({ items, empty = "No markets yet." }: { items: MarketListItem[]; empty?: string }) {
  if (items.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">{empty}</p>
      </Card>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((m) => (
        <li key={m.id}>
          <Link
            href={`/markets/${m.id}`}
            className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-5 py-4 transition-colors hover:border-accent"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">{m.question}</span>
              <StatusBadge status={m.status} />
            </div>
            <p className="text-sm text-muted">
              {m.makerName} made {fmtNumber(m.low)}–{fmtNumber(m.high)}
              {m.unit ? ` ${m.unit}` : ""} · {m.playerCount} {m.playerCount === 1 ? "taker" : "takers"}
              {m.trueValue !== null && ` · answer ${fmtNumber(m.trueValue)}`} · {fmtDate(m.createdAt)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
