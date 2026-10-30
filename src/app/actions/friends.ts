"use server";

import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { friendships, users } from "@/db/schema";
import { requireUser } from "@/lib/dal";
import { findUserByIdentifier, getFriendship } from "@/lib/friends";
import { Username } from "@/lib/username";

export type FriendFormState = { error?: string; message?: string; value?: string } | undefined;

function revalidateFriends() {
  revalidatePath("/friends");
  revalidatePath("/");
  revalidatePath("/markets/new");
}

export async function sendFriendRequest(_state: FriendFormState, formData: FormData): Promise<FriendFormState> {
  const me = await requireUser();
  const value = String(formData.get("identifier") ?? "").trim();
  if (!value) return { error: "Enter a username or email.", value };

  const other = await findUserByIdentifier(value);
  if (!other) {
    return {
      error: value.includes("@") && !value.startsWith("@")
        ? "Nobody has an account with that email yet. Send them the link to sign up first."
        : "No one has that username.",
      value,
    };
  }
  if (other.id === me.id) return { error: "That's you.", value };

  const existing = await getFriendship(me.id, other.id);
  if (existing?.status === "ACCEPTED") return { message: `You're already friends with ${other.name}.` };
  if (existing && existing.requesterId === me.id) return { message: `You've already sent ${other.name} a request.` };
  if (existing) {
    // They'd already asked us, so asking back is the same as accepting.
    await db
      .update(friendships)
      .set({ status: "ACCEPTED" })
      .where(and(eq(friendships.requesterId, other.id), eq(friendships.addresseeId, me.id)));
    revalidateFriends();
    return { message: `You and ${other.name} are now friends.` };
  }

  await db.insert(friendships).values({ requesterId: me.id, addresseeId: other.id });
  revalidateFriends();
  return { message: `Friend request sent to ${other.name}.` };
}

export async function acceptFriendRequest(requesterId: string) {
  const me = await requireUser();
  await db
    .update(friendships)
    .set({ status: "ACCEPTED" })
    .where(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, me.id), eq(friendships.status, "PENDING")));
  revalidateFriends();
}

/** Declines an incoming request, cancels an outgoing one, or unfriends: the row goes either way. */
export async function removeFriendship(otherId: string) {
  const me = await requireUser();
  await db
    .delete(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, otherId)),
        and(eq(friendships.requesterId, otherId), eq(friendships.addresseeId, me.id)),
      ),
    );
  revalidateFriends();
}

export async function changeUsername(_state: FriendFormState, formData: FormData): Promise<FriendFormState> {
  const me = await requireUser();
  const raw = String(formData.get("username") ?? "");
  const parsed = Username.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, value: raw };

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, parsed.data));
  if (taken && taken.id !== me.id) return { error: "That username is taken.", value: raw };

  await db.update(users).set({ username: parsed.data }).where(eq(users.id, me.id));
  revalidatePath("/", "layout");
  return { message: `Your username is now @${parsed.data}.`, value: parsed.data };
}
