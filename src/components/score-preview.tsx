import { fmtNumber, fmtPoints, pointsClass } from "@/lib/format";
import { scoreMarket, validateMarket, validateTrueValue, type MarketQuote } from "@/lib/scoring";

/** Shows what each player would score if the market resolved at `trueValue`. Renders nothing until inputs are valid. */
export function ScorePreview({ quote, trueValue, names }: { quote: MarketQuote; trueValue: number; names: Map<string, string> }) {
  if (validateMarket(quote).length > 0 || validateTrueValue(trueValue).length > 0) return null;
  const result = scoreMarket(quote, trueValue);
  const rows = [
    ...result.transfers.map((t) => ({ id: t.takerId, label: names.get(t.takerId) ?? "?", raw: t.raw, points: t.points })),
    { id: quote.makerId, label: `${names.get(quote.makerId) ?? "?"} (MM)`, raw: result.makerRaw, points: result.makerPoints },
  ];
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 p-4">
      <p className="mb-2 text-sm font-medium">If the answer is {fmtNumber(trueValue)}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between gap-4">
            <span>{r.label}</span>
            <span className="font-mono tabular-nums">
              <span className="text-muted">{fmtNumber(r.raw)} → </span>
              <span className={pointsClass(r.points)}>{fmtPoints(r.points)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
