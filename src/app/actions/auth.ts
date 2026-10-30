"use server";

import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/session";
import { Username } from "@/lib/username";

export type AuthFormState =
  | {
      errors?: Partial<Record<"name" | "username" | "email" | "password", string[]>>;
      message?: string;
      email?: string;
      name?: string;
      username?: string;
    }
  | undefined;

const email = z.email({ error: "Enter a valid email." }).trim().toLowerCase();

const SignupSchema = z.object({
  name: z.string().trim().min(1, { error: "Enter your name." }).max(50, { error: "Keep it under 50 characters." }),
  username: Username,
  email,
  password: z.string().min(8, { error: "Use at least 8 characters." }).max(200),
});

// The "email" field also takes a username.
const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, { error: "Enter your email or username." }),
  password: z.string().min(1, { error: "Enter your password." }),
});

export async function signup(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const input = Object.fromEntries(formData);
  const parsed = SignupSchema.safeParse(input);
  const echo = { email: String(input.email ?? ""), name: String(input.name ?? ""), username: String(input.username ?? "") };
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, ...echo };

  const { name, username, email, password } = parsed.data;
  const existing = await db.select({ email: users.email, username: users.username }).from(users).where(or(eq(users.email, email), eq(users.username, username)));
  if (existing.some((u) => u.email === email)) return { errors: { email: ["An account with this email already exists."] }, ...echo };
  if (existing.length > 0) return { errors: { username: ["That username is taken."] }, ...echo };

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ name, username, email, passwordHash }).returning({ id: users.id });
  await createSession(user.id);
  redirect("/");
}

export async function login(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const input = Object.fromEntries(formData);
  const parsed = LoginSchema.safeParse(input);
  const echo = { email: String(input.email ?? "") };
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, ...echo };

  const login = parsed.data.email;
  const [user] = await db
    .select()
    .from(users)
    .where(login.includes("@") && !login.startsWith("@") ? eq(users.email, login) : eq(users.username, login.replace(/^@/, "")));
  const ok = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!ok) return { message: "Wrong login or password.", ...echo };

  await createSession(user.id);
  const next = String(formData.get("next") ?? "");
  // Only follow same-site paths, never an absolute URL from the query string.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
