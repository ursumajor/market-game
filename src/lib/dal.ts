import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { getSessionUser } from "./session";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

export const getCurrentUser = cache(getSessionUser);

/** For pages and actions that need a signed-in user; sends everyone else to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
