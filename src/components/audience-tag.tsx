type Audience = "EVERYONE" | "FRIENDS" | "GROUP" | "PEOPLE";

/** Who an online question is shared with; nothing for public ones. */
export function AudienceTag({ audience, groupName, creatorName }: { audience: Audience; groupName: string | null; creatorName: string }) {
  if (audience === "EVERYONE") return null;
  const label = { FRIENDS: `${creatorName}'s friends`, GROUP: groupName ?? "Group", PEOPLE: "Invite only" }[audience];
  return <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">{label}</span>;
}
