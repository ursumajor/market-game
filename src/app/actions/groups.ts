"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/db";
import { groupMembers, groups } from "@/db/schema";
import { requireUser } from "@/lib/dal";

export type GroupFormState = { error?: string; value?: string } | undefined;

// No 0/O/1/I/L so codes survive being read aloud.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function newInviteCode() {
  return Array.from(randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

const GroupName = z.string().trim().min(1, { error: "Give the group a name." }).max(60, { error: "Keep it under 60 characters." });

export async function createGroup(_state: GroupFormState, formData: FormData): Promise<GroupFormState> {
  const user = await requireUser();
  const parsed = GroupName.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message, value: String(formData.get("name") ?? "") };

  const groupId = await db.transaction(async (tx) => {
    const [group] = await tx
      .insert(groups)
      .values({ name: parsed.data, inviteCode: newInviteCode(), createdById: user.id })
      .returning({ id: groups.id });
    await tx.insert(groupMembers).values({ groupId: group.id, userId: user.id, role: "ADMIN" });
    return group.id;
  });
  redirect(`/groups/${groupId}`);
}

/** Accepts a bare code or a pasted invite link. */
function extractCode(input: string) {
  return input.trim().split("/").filter(Boolean).pop()?.toUpperCase() ?? "";
}

export async function joinGroup(_state: GroupFormState, formData: FormData): Promise<GroupFormState> {
  const user = await requireUser();
  const raw = String(formData.get("code") ?? "");
  const [group] = await db.select({ id: groups.id }).from(groups).where(eq(groups.inviteCode, extractCode(raw)));
  if (!group) return { error: "No group has that invite code.", value: raw };

  await db.insert(groupMembers).values({ groupId: group.id, userId: user.id }).onConflictDoNothing();
  redirect(`/groups/${group.id}`);
}
