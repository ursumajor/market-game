import * as z from "zod";

export const USERNAME_RULE = /^[a-z0-9_]{3,20}$/;

/** Accepts "@Name" or "name"; stores lowercase without the @. */
export const Username = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) => s.replace(/^@/, ""))
  .pipe(z.string().regex(USERNAME_RULE, { error: "Use 3–20 lowercase letters, numbers or underscores." }));
