"use client";

import { useActionState } from "react";
import { changeUsername, sendFriendRequest } from "@/app/actions/friends";
import { Button, Input } from "@/components/ui";

function InlineForm({
  action: serverAction,
  name,
  label,
  placeholder,
  submitLabel,
  defaultValue,
}: {
  action: typeof sendFriendRequest;
  name: string;
  label: string;
  placeholder?: string;
  submitLabel: string;
  defaultValue?: string;
}) {
  const [state, action, pending] = useActionState(serverAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input name={name} aria-label={label} placeholder={placeholder} defaultValue={state?.value ?? defaultValue} required />
        <Button type="submit" disabled={pending} className="shrink-0">
          {submitLabel}
        </Button>
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.message && <p className="text-sm text-gain">{state.message}</p>}
    </form>
  );
}

export function AddFriendForm() {
  return (
    <InlineForm
      action={sendFriendRequest}
      name="identifier"
      label="Username or email"
      placeholder="@username or email"
      submitLabel="Send request"
    />
  );
}

export function UsernameForm({ current }: { current: string }) {
  return <InlineForm action={changeUsername} name="username" label="Username" submitLabel="Save" defaultValue={current} />;
}
