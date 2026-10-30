import Link from "next/link";
import type { ComponentProps } from "react";

const cx = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(" ");

export function Button({ className, variant = "primary", ...props }: ComponentProps<"button"> & { variant?: "primary" | "ghost" }) {
  return (
    <button
      className={cx(
        "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "primary" && "bg-accent text-accent-foreground hover:bg-accent/90",
        variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, htmlFor, errors, children }: { label: string; htmlFor: string; errors?: string[]; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {errors?.map((e) => (
        <p key={e} className="text-sm text-danger">
          {e}
        </p>
      ))}
    </div>
  );
}

export function ButtonLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cx(
        "inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90",
        className,
      )}
      {...props}
    />
  );
}

const STATUS_STYLES = {
  PENDING: "bg-surface-2 text-foreground",
  OPEN: "bg-accent/15 text-accent",
  RESOLVED: "bg-gain/15 text-gain",
  VOID: "bg-surface-2 text-muted",
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_STYLES }) {
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLES[status])}>
      {{ PENDING: "Pending", OPEN: "Open", RESOLVED: "Resolved", VOID: "Void" }[status]}
    </span>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{children}</h2>;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-border bg-surface p-6", className)} {...props} />;
}
