import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { getIncomingRequests } from "@/lib/friends";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Market Game",
  description: "Make markets, take sides, and keep score with your friends.",
};

async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  const requests = (await getIncomingRequests(user.id)).length;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Link href="/global" className="rounded-lg px-3 py-1.5 hover:bg-surface-2">
        Global
      </Link>
      <Link href="/friends" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-surface-2">
        Friends
        {requests > 0 && (
          <span className="rounded-full bg-accent px-1.5 text-xs font-medium text-accent-foreground" aria-label={`${requests} pending`}>
            {requests}
          </span>
        )}
      </Link>
      <span className="hidden text-muted sm:inline">@{user.username}</span>
      <form action="/logout" method="post">
        <Button variant="ghost" className="h-8 px-3">
          Log out
        </Button>
      </form>
    </div>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
            <Link href="/" className="font-semibold tracking-tight">
              Market Game
            </Link>
            <Suspense>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
