"use client";

import { startTransition, useActionState, useState } from "react";
import type { MarketFormState } from "@/app/actions/markets";
import { ScorePreview } from "@/components/score-preview";
import { Button, Input } from "@/components/ui";
import { parseNumber } from "@/lib/format";
import type { MarketQuote } from "@/lib/scoring";

export function ResolveForm({
  resolve,
  quote,
  names,
  initialValue = "",
  submitLabel = "Resolve",
}: {
  resolve: (state: MarketFormState, formData: FormData) => Promise<MarketFormState>;
  quote: MarketQuote;
  names: [string, string][];
  initialValue?: string;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState(resolve, undefined);
  const [trueValue, setTrueValue] = useState(initialValue);

  return (
    <form
      // onSubmit so a server-side error doesn't reset the input (see market-form.tsx).
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex gap-2">
        <Input
          name="trueValue"
          inputMode="decimal"
          aria-label="Answer"
          placeholder="The true answer"
          value={trueValue}
          onChange={(e) => setTrueValue(e.target.value)}
          required
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          {submitLabel}
        </Button>
      </div>
      {state?.errors?.map((e) => (
        <p key={e} className="text-sm text-danger">
          {e}
        </p>
      ))}
      <ScorePreview quote={quote} trueValue={parseNumber(trueValue)} names={new Map(names)} />
    </form>
  );
}
