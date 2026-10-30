"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { login, signup } from "@/app/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action, pending] = useActionState(mode === "login" ? login : signup, undefined);
  const next = useSearchParams().get("next") ?? "";
  const isSignup = mode === "signup";

  return (
    <Card className="mx-auto w-full max-w-sm">
      <h1 className="mb-6 text-xl font-semibold">{isSignup ? "Create an account" : "Log in"}</h1>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        {isSignup && (
          <Field label="Name" htmlFor="name" errors={state?.errors?.name}>
            <Input id="name" name="name" autoComplete="name" defaultValue={state?.name} required />
          </Field>
        )}
        {isSignup && (
          <Field label="Username" htmlFor="username" errors={state?.errors?.username}>
            <Input id="username" name="username" autoComplete="username" placeholder="3–20 letters, numbers, _" defaultValue={state?.username} required />
          </Field>
        )}
        <Field label={isSignup ? "Email" : "Email or username"} htmlFor="email" errors={state?.errors?.email}>
          <Input
            id="email"
            name="email"
            type={isSignup ? "email" : "text"}
            autoComplete={isSignup ? "email" : "username"}
            defaultValue={state?.email}
            required
          />
        </Field>
        <Field label="Password" htmlFor="password" errors={state?.errors?.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? 8 : undefined}
            required
          />
        </Field>
        {state?.message && <p className="text-sm text-danger">{state.message}</p>}
        <Button type="submit" disabled={pending} className="mt-2">
          {pending ? "…" : isSignup ? "Sign up" : "Log in"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {isSignup ? "Already have an account? " : "New here? "}
        <Link
          href={{ pathname: isSignup ? "/login" : "/signup", query: next ? { next } : {} }}
          className="font-medium text-accent hover:underline"
        >
          {isSignup ? "Log in" : "Create an account"}
        </Link>
      </p>
    </Card>
  );
}
