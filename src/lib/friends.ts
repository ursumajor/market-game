import "server-only";

import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { friendships, users } from "@/db/schema";

export type PublicUser = { id: string; name: string; username: string };

const publicUser = { id: users.id, name: users.name, username: users.username };

/** Finds an account by "@username", "username" or email. */
export async function findUserByIdentifier(identifier: string): Promise<PublicUser | null> {
  const value = identifier.trim().toLowerCase();
  if (!value) return null;
  const where = value.includes("@") && !value.startsWith("@") ? eq(users.email, value) : eq(users.username, value.replace(/^@/, ""));
  const [user] = await db.select(publicUser).from(users).where(where);
  return user ?? null;
}

/** The friendship row between two users, whichever of them sent the request. */
export async function getFriendship(a: string, b: string) {
  const [row] = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
        and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
      ),
    );
  return row ?? null;
}

export async function getFriends(userId: string): Promise<PublicUser[]> {
  const rows = await db
    .select(publicUser)
    .from(friendships)
    .innerJoin(
      users,
      or(
        and(eq(friendships.requesterId, userId), eq(users.id, friendships.addresseeId)),
        and(eq(friendships.addresseeId, userId), eq(users.id, friendships.requesterId)),
      ),
    )
    .where(eq(friendships.status, "ACCEPTED"))
    .orderBy(asc(users.name));
  return rows;
}

export async function getFriendIds(userId: string): Promise<Set<string>> {
  return new Set((await getFriends(userId)).map((f) => f.id));
}

/** Requests other people have sent to the user. */
export async function getIncomingRequests(userId: string): Promise<PublicUser[]> {
  return db
    .select(publicUser)
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.requesterId))
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, "PENDING")))
    .orderBy(asc(users.name));
}

/** Requests the user has sent that haven't been answered. */
export async function getOutgoingRequests(userId: string): Promise<PublicUser[]> {
  return db
    .select(publicUser)
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.addresseeId))
    .where(and(eq(friendships.requesterId, userId), eq(friendships.status, "PENDING")))
    .orderBy(asc(users.name));
}
