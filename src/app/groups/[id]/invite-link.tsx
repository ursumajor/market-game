"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(`${window.location.origin}/join/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted">
        Invite code <span className="font-mono text-foreground">{code}</span>
      </span>
      <Button variant="ghost" className="h-8 px-3" onClick={copy}>
        {copied ? "Copied!" : "Copy link"}
      </Button>
    </div>
  );
}
