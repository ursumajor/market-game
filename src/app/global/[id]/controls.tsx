"use client";

import { startTransition, useActionState, useState } from "react";
import type { GlobalFormState } from "@/app/actions/global";
import { Button, Field, Input } from "@/components/ui";
import { fmtNumber, fmtPoints, parseNumber, pointsClass } from "@/lib/format";
import { scoreTrades, type Trade } from "@/lib/order-book";
import { validateTrueValue } from "@/lib/scoring";

type FormAction = (state: GlobalFormState, formData: FormData) => Promise<GlobalFormState>;

function Messages({ state }: { state: GlobalFormState }) {
  return (
    <>
      {state?.errors?.map((e) => (
        <p key={e} className="text-sm text-danger">
          {e}
        </p>
      ))}
      {state?.message && <p className="text-sm text-gain">{state.message}</p>}
    </>
  );
}

/** Buy at the quote's high / sell at its low. `blocker` explains why trading is off, if it is. */
export function TradeButtons({
  buy,
  sell,
  low,
  high,
  blocker,
}: {
  buy: () => Promise<GlobalFormState>;
  sell: () => Promise<GlobalFormState>;
  low: number;
  high: number;
  blocker: string | null;
}) {
  const [buyState, runBuy, buying] = useActionState(buy, undefined);
  const [sellState, runSell, selling] = useActionState(sell, undefined);
  const busy = buying || selling;
  const error = buyState?.errors?.[0] ?? sellState?.errors?.[0];

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1" title={blocker ?? undefined}>
        <form action={runSell}>
          <Button type="submit" variant="ghost" disabled={busy || !!blocker} className="h-8 border border-border px-3 font-mono tabular-nums">
            Sell {fmtNumber(low)}
          </Button>
        </form>
        <form action={runBuy}>
          <Button type="submit" variant="ghost" disabled={busy || !!blocker} className="h-8 border border-border px-3 font-mono tabular-nums">
            Buy {fmtNumber(high)}
          </Button>
        </form>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Post or replace the user's own quote. */
export function QuoteForm({ post, current }: { post: FormAction; current: { low: number; high: number; maxTrades: number | null } | null }) {
  const [state, action, pending] = useActionState(post, undefined);
  const [low, setLow] = useState(current ? String(current.low) : "");
  const [high, setHigh] = useState(current ? String(current.high) : "");
  const [cap, setCap] = useState(current?.maxTrades ? String(current.maxTrades) : "");

  return (
    <form
      // onSubmit so a server error doesn't reset the inputs (see markets/new/market-form.tsx).
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Low (you buy)" htmlFor="low">
          <Input id="low" name="low" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} required />
        </Field>
        <Field label="High (you sell)" htmlFor="high">
          <Input id="high" name="high" inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} required />
        </Field>
        <Field label="Max trades" htmlFor="maxTrades">
          <Input id="maxTrades" name="maxTrades" inputMode="numeric" placeholder="No cap" value={cap} onChange={(e) => setCap(e.target.value)} />
        </Field>
      </div>
      <Messages state={state} />
      <Button type="submit" disabled={pending} className="self-end">
        {current ? "Update my market" : "Make a market"}
      </Button>
    </form>
  );
}

/** A one-number or one-line form: proposing an answer, disputing one. */
export function InlineForm({
  action: serverAction,
  name,
  label,
  placeholder,
  submitLabel,
  numeric = false,
  initialValue = "",
}: {
  action: FormAction;
  name: string;
  label: string;
  placeholder?: string;
  submitLabel: string;
  numeric?: boolean;
  initialValue?: string;
}) {
  const [state, action, pending] = useActionState(serverAction, undefined);
  const [value, setValue] = useState(initialValue);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex gap-2">
        <Input
          name={name}
          aria-label={label}
          placeholder={placeholder}
          inputMode={numeric ? "decimal" : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          {submitLabel}
        </Button>
      </div>
      <Messages state={state} />
    </form>
  );
}

/**
 * The user's trades on this question (as taker or MM), and what they'd score at
 * a given answer. `trades` is every trade on the question, since they share the pot.
 */
export function MyTrades({ trades: allTrades, meId, unit }: { trades: (Trade & { makerName: string; takerName: string })[]; meId: string; unit: string }) {
  const [answer, setAnswer] = useState("");
  const x = parseNumber(answer);
  const valid = validateTrueValue(x).length === 0;
  const scored = valid ? scoreTrades(allTrades, x) : allTrades.map((t) => ({ ...t, points: 0 }));
  const trades = scored.filter((t) => t.takerId === meId || t.makerId === meId);
  const myPoints = (t: (typeof trades)[number]) => (t.takerId === meId ? 1 : -1) * t.points;
  const total = trades.reduce((s, t) => s + myPoints(t), 0);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1 text-sm">
        {trades.map((t) => {
          const asTaker = t.takerId === meId;
          const verb = t.side === "BUY" ? "bought" : "sold";
          const price = t.side === "BUY" ? t.high : t.low;
          return (
            <li key={`${t.quoteId}:${t.takerId}`} className="flex justify-between gap-3">
              <span>
                {asTaker ? `You ${verb} from ${t.makerName}` : `${t.takerName} ${verb} from you`} at{" "}
                <span className="font-mono tabular-nums">{fmtNumber(price)}</span>
                {unit}
              </span>
              {valid && <span className={`font-mono tabular-nums ${pointsClass(myPoints(t))}`}>{fmtPoints(myPoints(t))}</span>}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 border-t border-border pt-3">
        <Input
          aria-label="Try an answer"
          placeholder="Try an answer"
          inputMode="decimal"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className="max-w-40"
        />
        {valid && (
          <span className="text-sm">
            With the trades so far, you&apos;d score <span className={`font-mono font-semibold tabular-nums ${pointsClass(total)}`}>{fmtPoints(total)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
