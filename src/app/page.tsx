import Link from "next/link";
import { Suspense } from "react";
import { acceptFriendRequest, removeFriendship } from "@/app/actions/friends";
import { ActionButton } from "@/components/action-button";
import { MarketList } from "@/components/market-list";
import { QuestionSection } from "@/components/question-list";
import { ButtonLink, Card, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/dal";
import { getMyGroups, getMyMarketInvites, getMyTransfers, getMyUngroupedMarkets, getUserNames } from "@/lib/data";
import { getIncomingRequests } from "@/lib/friends";
import { fmtPoints, pointsClass } from "@/lib/format";
import { listQuestions } from "@/lib/global";
import { pairwiseBalances, totals } from "@/lib/ledger";
import { GroupForms } from "./group-forms";

function Points({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`font-mono tabular-nums ${pointsClass(value)} ${className}`}>{fmtPoints(value)}</span>;
}

/** Your head to head with everyone you've played, from every market, plus the overall total. */
async function HeadToHead({ userId }: { userId: string }) {
  const entries = await getMyTransfers(userId);
  if (entries.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">Resolve a market to start your head-to-head record.</p>
      </Card>
    );
  }

  const myTotal = totals(entries).get(userId) ?? 0;
  const vsOthers = [...(pairwiseBalances(entries).get(userId) ?? new Map<string, number>())];
  const names = await getUserNames(vsOthers.map(([id]) => id));
  const rows = vsOthers.map(([id, points]) => ({ id, name: names.get(id) ?? "?", points })).sort((a, b) => b.points - a.points);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">Your total</span>
        <Points value={myTotal} className="text-lg font-semibold" />
      </div>
      <ul className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between">
            <span className="text-muted">vs {r.name}</span>
            <Points value={r.points} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Friend requests and market invites waiting on the user. Renders nothing when there are none. */
async function Invitations({ userId }: { userId: string }) {
  const [requests, invites] = await Promise.all([getIncomingRequests(userId), getMyMarketInvites(userId)]);
  if (requests.length === 0 && invites.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>Invitations</SectionTitle>
      <Card className="flex flex-col divide-y divide-border p-0">
        {requests.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <span>
              <span className="font-medium">{r.name}</span> <span className="text-muted">@{r.username}</span> wants to be friends
            </span>
            <div className="flex gap-1">
              <ActionButton action={acceptFriendRequest.bind(null, r.id)} label="Accept" variant="primary" />
              <ActionButton action={removeFriendship.bind(null, r.id)} label="Decline" />
            </div>
          </div>
        ))}
        {invites.map((m) => (
          <Link key={m.id} href={`/markets/${m.id}`} className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-surface-2/50">
            <span>
              <span className="font-medium">{m.creatorName}</span> added you to <span className="font-medium">{m.question}</span>
            </span>
            <span className="shrink-0 text-sm text-accent">Review →</span>
          </Link>
        ))}
      </Card>
    </section>
  );
}

async function Dashboard() {
  const user = await requireUser();
  const [myGroups, ungrouped, questions] = await Promise.all([
    getMyGroups(user.id),
    getMyUngroupedMarkets(user.id),
    listQuestions(user.id),
  ]);
  // Open online questions shared with the user (not public ones, not their own).
  const shared = questions.filter((q) => q.audience !== "EVERYONE" && q.createdById !== user.id && q.status === "OPEN" && !q.closed);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Hi, {user.name}</h1>
        <ButtonLink href="/markets/new">New market</ButtonLink>
      </div>

      <Invitations userId={user.id} />

      <QuestionSection title="Online questions shared with you" rows={shared} />

      <section className="flex flex-col gap-3">
        <SectionTitle>Your groups</SectionTitle>
        {myGroups.length === 0 ? (
          <Card>
            <p className="text-muted">You&apos;re not in any groups yet. Create one, or join with an invite code.</p>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {myGroups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent"
                >
                  <div>
                    <p className="font-medium">{g.name}</p>
                    <p className="text-sm text-muted">
                      {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                    </p>
                  </div>
                  <Points value={g.myPoints} className="text-lg" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Head to head</SectionTitle>
        <HeadToHead userId={user.id} />
      </section>

      <GroupForms />

      <section className="flex flex-col gap-3">
        <SectionTitle>Markets outside groups</SectionTitle>
        <MarketList items={ungrouped} empty="Markets you play outside a group show up here." />
      </section>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Dashboard />
    </Suspense>
  );
}
