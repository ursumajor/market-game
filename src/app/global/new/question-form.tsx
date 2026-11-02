"use client";

import { startTransition, useActionState, useState } from "react";
import { createQuestion } from "@/app/actions/global";
import { PeoplePicker, type Person } from "@/components/people-picker";
import { Button, Card, Field, Input } from "@/components/ui";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

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

// The audience <select> value is EVERYONE, FRIENDS, PEOPLE, or "group:<id>".
function audienceHint(choice: string, groupName?: string) {
  if (choice === "EVERYONE") return "Anyone signed in can see it, make a market and trade.";
  if (choice === "FRIENDS") return "Your friends can see it, including people you become friends with later.";
  if (choice === "PEOPLE") return "Only the people you pick can see it. They don't need to be your friends.";
  return `Members of ${groupName} can see it, including people who join later. It's listed on the group's page.`;
}

export function QuestionForm({
  groups,
  friends,
  initialGroupId,
}: {
  groups: { id: string; name: string }[];
  friends: Person[];
  initialGroupId?: string;
}) {
  const [state, action, pending] = useActionState(createQuestion, undefined);
  const [closesLocal, setClosesLocal] = useState("");
  const [choice, setChoice] = useState(initialGroupId ? `group:${initialGroupId}` : "EVERYONE");
  const [people, setPeople] = useState<Person[]>([]);
  const groupId = choice.startsWith("group:") ? choice.slice("group:".length) : "";
  const audience = groupId ? "GROUP" : choice;

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
      <input type="hidden" name="audience" value={audience} />
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="invitees" value={JSON.stringify(people.map((p) => p.id))} />

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
        <Field label="Who can see it?" htmlFor="audience">
          <select id="audience" value={choice} onChange={(e) => setChoice(e.target.value)} className={SELECT_CLASS}>
            <option value="EVERYONE">Everyone</option>
            <option value="FRIENDS">My friends</option>
            {groups.map((g) => (
              <option key={g.id} value={`group:${g.id}`}>
                Group: {g.name}
              </option>
            ))}
            <option value="PEOPLE">Specific people</option>
          </select>
        </Field>
        <p className="text-sm text-muted">{audienceHint(choice, groups.find((g) => g.id === groupId)?.name)}</p>
        {audience === "PEOPLE" && (
          <PeoplePicker
            people={people}
            friends={friends}
            onAdd={(p) => setPeople((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]))}
            onRemove={(id) => setPeople((prev) => prev.filter((p) => p.id !== id))}
          />
        )}
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
          You can make a market and trade on it too. After trading closes you enter the answer, and anyone who took part has a day to
          dispute it.
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
