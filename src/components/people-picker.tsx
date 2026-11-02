"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { findPlayer } from "@/app/actions/markets";
import { Button, Input } from "@/components/ui";

// needsApproval: not the user's friend, so they must accept before a market counts.
export type Person = { id: string; name: string; needsApproval?: boolean };

/**
 * Picks people: friends in one click, anyone else by username or email. With
 * markNonFriends, people the user isn't friends with are tagged (they must
 * accept before a market counts) and nonFriendNote explains why.
 */
export function PeoplePicker({
  people: players,
  friends,
  onAdd,
  onRemove,
  markNonFriends = false,
  nonFriendNote,
}: {
  people: Person[];
  friends: Person[];
  onAdd: (p: Person) => void;
  onRemove: (id: string) => void;
  markNonFriends?: boolean;
  nonFriendNote?: string;
}) {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string>();
  const [looking, startLookup] = useTransition();
  const suggestions = friends.filter((f) => !players.some((p) => p.id === f.id));

  function add() {
    startLookup(async () => {
      const result = await findPlayer(identifier);
      if (result.player) {
        const { id, name, isFriend } = result.player;
        onAdd({ id, name, needsApproval: markNonFriends && !isFriend });
        setIdentifier("");
        setError(undefined);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pr-1 pl-3 text-sm">
            {p.name}
            {p.needsApproval && <span className="text-xs text-muted">· needs to accept</span>}
            <button
              type="button"
              onClick={() => onRemove(p.id)}
              aria-label={`Remove ${p.name}`}
              className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-border hover:text-foreground"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          aria-label="Add someone by username or email"
          placeholder="Add by username or email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds the player instead of submitting the whole market.
            if (e.key === "Enter") {
              e.preventDefault();
              if (identifier.trim()) add();
            }
          }}
        />
        <Button type="button" variant="ghost" onClick={add} disabled={looking || !identifier.trim()} className="shrink-0 border border-border">
          Add
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {friends.length === 0 ? (
        <p className="text-sm text-muted">
          <Link href="/friends" className="text-accent hover:underline">
            Add friends
          </Link>{" "}
          to pick them here in one click.
        </p>
      ) : (
        suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Friends:</span>
            {suggestions.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onAdd(f)}
                className="rounded-full border border-border px-3 py-1 hover:border-accent hover:text-accent"
              >
                + {f.name}
              </button>
            ))}
          </div>
        )
      )}
      {nonFriendNote && players.some((p) => p.needsApproval) && <p className="text-sm text-muted">{nonFriendNote}</p>}
    </div>
  );
}
