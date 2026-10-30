"use client";

import { useActionState } from "react";
import { createGroup, joinGroup } from "@/app/actions/groups";
import { Button, Card, Input } from "@/components/ui";

function SingleFieldForm({
  title,
  name,
  placeholder,
  submitLabel,
  action: serverAction,
}: {
  title: string;
  name: string;
  placeholder: string;
  submitLabel: string;
  action: typeof createGroup;
}) {
  const [state, action, pending] = useActionState(serverAction, undefined);
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-medium">{title}</h2>
      <form action={action} className="flex gap-2">
        <Input name={name} placeholder={placeholder} defaultValue={state?.value} aria-label={title} required />
        <Button type="submit" disabled={pending} className="shrink-0">
          {submitLabel}
        </Button>
      </form>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
    </Card>
  );
}

export function JoinButton({ code }: { code: string }) {
  const [state, action, pending] = useActionState(joinGroup, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="code" value={code} />
      <Button type="submit" disabled={pending}>
        Join group
      </Button>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}

export function GroupForms() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SingleFieldForm title="New group" name="name" placeholder="Friday trivia" submitLabel="Create" action={createGroup} />
      <SingleFieldForm title="Join a group" name="code" placeholder="Invite code or link" submitLabel="Join" action={joinGroup} />
    </div>
  );
}
