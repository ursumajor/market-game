"use client";

import { startTransition, useActionState, useState } from "react";
import { createQuestion } from "@/app/actions/global";
import { Button, Card, Field, Input } from "@/components/ui";

const PRESETS = [
  { label: "1 hour", ms: 3_600_000 },
  { label: "1 day", ms: 86_400_000 },
  { label: "1 week", ms: 7 * 86_400_000 },
];

/** A Date as the "YYYY-MM-DDTHH:mm" a datetime-local input expects, in local time. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function QuestionForm() {
  const [state, action, pending] = useActionState(createQuestion, undefined);
  const [closesLocal, setClosesLocal] = useState("");

  return (
    <form
      // onSubmit so a server error doesn't reset the form (see markets/new/market-form.tsx).
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        // The input is in the viewer's timezone; send an unambiguous instant.
        if (closesLocal) formData.set("closesAt", new Date(closesLocal).toISOString());
        startTransition(() => action(formData));
      }}
      className="flex flex-col gap-6"
    >
      <Card className="flex flex-col gap-4">
        <Field label="Question" htmlFor="question">
          <Input id="question" name="question" placeholder="How many people will run the 2027 Boston Marathon?" required />
        </Field>
        <Field label="Unit (optional)" htmlFor="unit">
          <Input id="unit" name="unit" placeholder="runners" />
        </Field>
        <Field label="Where will the answer come from?" htmlFor="answerSource">
          <Input id="answerSource" name="answerSource" placeholder="A link, or e.g. “the official results page”" required />
        </Field>
      </Card>

      <Card className="flex flex-col gap-3">
        <Field label="Trading closes" htmlFor="closesAt">
          <Input
            id="closesAt"
            type="datetime-local"
            value={closesLocal}
            onChange={(e) => setClosesLocal(e.target.value)}
            required
          />
        </Field>
        <div className="flex flex-wrap gap-2 text-sm">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setClosesLocal(toLocalInput(new Date(Date.now() + p.ms)))}
              className="rounded-full border border-border px-3 py-1 hover:border-accent hover:text-accent"
            >
              in {p.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">
          You&apos;ll enter the answer after trading closes. Since you might know it, you can&apos;t make a market or trade on your own
          question.
        </p>
      </Card>

      {state?.errors && (
        <ul className="flex flex-col gap-1 text-sm text-danger">
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <Button type="submit" disabled={pending} className="self-end">
        Post question
      </Button>
    </form>
  );
}
