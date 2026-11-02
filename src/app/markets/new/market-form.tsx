"use client";

import { startTransition, useActionState, useState } from "react";
import { createMarket } from "@/app/actions/markets";
import { PeoplePicker, type Person } from "@/components/people-picker";
import { ScorePreview } from "@/components/score-preview";
import { Button, Card, Field, Input } from "@/components/ui";
import { parseNumber } from "@/lib/format";
import type { Position, Side } from "@/lib/scoring";

type GroupOption = { id: string; name: string; members: Person[] };

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

const SIDE_OPTIONS: { value: Side | null; label: string }[] = [
  { value: null, label: "Sat out" },
  { value: "LOWER", label: "Lower" },
  { value: "HIGHER", label: "Higher" },
];

function SideToggle({ value, onChange, name }: { value: Side | null; onChange: (s: Side | null) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={`${name}'s side`} className="inline-flex rounded-lg border border-border p-0.5 text-sm">
      {SIDE_OPTIONS.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              selected
                ? o.value === null
                  ? "bg-surface-2 text-foreground"
                  : "bg-accent text-accent-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function MarketForm({
  me,
  groups,
  friends,
  initialGroupId,
}: {
  me: Person;
  groups: GroupOption[];
  friends: Person[];
  initialGroupId: string;
}) {
  const [state, action, pending] = useActionState(createMarket, undefined);
  const [question, setQuestion] = useState("");
  const [unit, setUnit] = useState("");
  const [groupId, setGroupId] = useState(initialGroupId);
  const [manualPlayers, setManualPlayers] = useState<Person[]>([me]);
  const [makerId, setMakerId] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [sides, setSides] = useState<Record<string, Side | null>>({});
  const [trueValue, setTrueValue] = useState("");

  const group = groups.find((g) => g.id === groupId);
  const pool = group ? group.members : manualPlayers;
  // Switching groups or removing a player can leave a stale maker; treat it as unpicked.
  const maker = pool.some((p) => p.id === makerId) ? makerId : "";
  const takers = pool.filter((p) => p.id !== maker);
  const positions: Position[] = takers.flatMap((p) => (sides[p.id] ? [{ userId: p.id, side: sides[p.id]! }] : []));
  const names = new Map(pool.map((p) => [p.id, p.name]));

  return (
    <form
      // onSubmit rather than action={...}: React resets forms after an action,
      // which would wipe the whole form whenever the server reports an error.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="makerId" value={maker} />
      <input type="hidden" name="positions" value={JSON.stringify(positions)} />

      <Card className="flex flex-col gap-4">
        <Field label="Question" htmlFor="question">
          <Input
            id="question"
            name="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="How tall is the Eiffel Tower?"
            required
          />
        </Field>
        <Field label="Unit (optional)" htmlFor="unit">
          <Input id="unit" name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="meters" />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <Field label="Group" htmlFor="group">
          <select id="group" value={groupId} onChange={(e) => setGroupId(e.target.value)} className={SELECT_CLASS}>
            <option value="">No group: pick players yourself</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        {group ? (
          <p className="text-sm text-muted">Players come from {group.name}, and the market is listed on its page.</p>
        ) : (
          <PeoplePicker
            people={manualPlayers}
            friends={friends}
            onAdd={(p) => setManualPlayers((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]))}
            onRemove={(id) => setManualPlayers((prev) => prev.filter((p) => p.id !== id))}
            markNonFriends
            nonFriendNote="Players you aren't friends with have to accept first. Until they do, the market is pending and nobody scores."
          />
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <Field label="Market maker" htmlFor="makerId">
          <select id="makerId" value={maker} onChange={(e) => setMakerId(e.target.value)} required className={SELECT_CLASS}>
            <option value="" disabled>
              Who made the market?
            </option>
            {pool.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Low" htmlFor="low">
            <Input id="low" name="low" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} required />
          </Field>
          <Field label="High" htmlFor="high">
            <Input id="high" name="high" inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} required />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Who took which side?</h2>
        {!maker ? (
          <p className="text-sm text-muted">Pick the market maker first.</p>
        ) : takers.length === 0 ? (
          <p className="text-sm text-muted">
            {group ? "Nobody else is in this group yet. Share the invite link first." : "Add the other players above."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {takers.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{p.name}</span>
                <SideToggle name={p.name} value={sides[p.id] ?? null} onChange={(s) => setSides((prev) => ({ ...prev, [p.id]: s }))} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <Field label="Answer (optional)" htmlFor="trueValue">
          <Input
            id="trueValue"
            name="trueValue"
            inputMode="decimal"
            value={trueValue}
            onChange={(e) => setTrueValue(e.target.value)}
            placeholder="Leave blank to resolve later"
          />
        </Field>
        <ScorePreview
          quote={{ makerId: maker, low: parseNumber(low), high: parseNumber(high), positions }}
          trueValue={parseNumber(trueValue)}
          names={names}
        />
      </Card>

      {state?.errors && (
        <ul className="flex flex-col gap-1 text-sm text-danger">
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <Button type="submit" disabled={pending} className="self-end">
        {trueValue.trim() ? "Create and resolve" : "Create market"}
      </Button>
    </form>
  );
}
