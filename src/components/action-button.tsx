"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";

/** A one-click server action, optionally behind a confirm() prompt. */
export function ActionButton({
  action,
  label,
  confirmText,
  variant = "ghost",
}: {
  action: () => Promise<void>;
  label: string;
  confirmText?: string;
  variant?: "primary" | "ghost";
}) {
  const [, run, pending] = useActionState(action, undefined);
  return (
    <form
      action={run}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <Button variant={variant} type="submit" disabled={pending} className="h-8 px-3">
        {label}
      </Button>
    </form>
  );
}
