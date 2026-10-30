import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MarketList } from "@/components/market-list";
import { ButtonLink, Card, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/dal";
import { getGroupMarkets, getMembers, getMembership, getTransfersAmong } from "@/lib/data";
import { fmtPoints, pointsClass } from "@/lib/format";
import { pairwiseBalances, playerStats, totals } from "@/lib/ledger";
import { InviteLink } from "./invite-link";

type Members = Awaited<ReturnType<typeof getMembers>>;
type Transfers = Awaited<ReturnType<typeof getTransfersAmong>>;

function Points({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`font-mono tabular-nums ${pointsClass(value)} ${className}`}>{fmtPoints(value)}</span>;
}

function Leaderboard({ members, entries, meId }: { members: Members; entries: Transfers; meId: string }) {
  const total = totals(entries);
  const stats = playerStats(entries);
  const rows = members
    .map((m) => ({ ...m, total: total.get(m.id) ?? 0, stats: stats.get(m.id) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr className="border-b border-border">
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Player</th>
            <th className="px-4 py-3 text-right font-medium">Points</th>
            <th className="px-4 py-3 text-right font-medium">Taking</th>
            <th className="px-4 py-3 text-right font-medium">Making</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 text-muted">{i + 1}</td>
              <td className="px-4 py-3">
                {r.name}
                {r.id === meId && <span className="text-muted"> (you)</span>}
              </td>
              <td className="px-4 py-3 text-right">
                <Points value={r.total} className="font-semibold" />
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <Points value={r.stats?.takerPoints ?? 0} /> <span className="text-muted">in {r.stats?.taken ?? 0}</span>
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <Points value={r.stats?.makerPoints ?? 0} /> <span className="text-muted">in {r.stats?.made ?? 0}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function HeadToHead({ members, entries }: { members: Members; entries: Transfers }) {
  const balances = pairwiseBalances(entries);
  const active = members.filter((m) => balances.has(m.id));
  if (active.length < 2) {
    return (
      <Card>
        <p className="text-sm text-muted">Resolve a market to see who has won points from whom.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="text-muted">
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left font-medium">Won from →</th>
            {active.map((m) => (
              <th key={m.id} className="px-4 py-3 text-right font-medium whitespace-nowrap">
                {m.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {active.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              <th className="px-4 py-3 text-left font-medium whitespace-nowrap">{row.name}</th>
              {active.map((col) => {
                const v = balances.get(row.id)?.get(col.id);
                return (
                  <td key={col.id} className="px-4 py-3 text-right">
                    {row.id === col.id || v === undefined ? <span className="text-muted">·</span> : <Points value={v} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

async function GroupView({ params }: { params: PageProps<"/groups/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const membership = await getMembership(id, user.id);
  if (!membership) notFound();

  const members = await getMembers(id);
  // Scores are head to head between members, from every market they've played, in this group or not.
  const [entries, groupMarkets] = await Promise.all([getTransfersAmong(members.map((m) => m.id)), getGroupMarkets(id)]);
  const { group } = membership;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Groups
          </Link>
          <h1 className="text-2xl font-semibold">{group.name}</h1>
          <InviteLink code={group.inviteCode} />
        </div>
        <ButtonLink href={`/markets/new?group=${group.id}`}>New market</ButtonLink>
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>Leaderboard</SectionTitle>
        <p className="-mt-1 text-sm text-muted">Each member&apos;s head-to-head total against the rest of the group, from every market.</p>
        <Leaderboard members={members} entries={entries} meId={user.id} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Head to head</SectionTitle>
        <HeadToHead members={members} entries={entries} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Markets</SectionTitle>
        <MarketList items={groupMarkets} />
      </section>
    </div>
  );
}

export default function GroupPage(props: PageProps<"/groups/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <GroupView params={props.params} />
    </Suspense>
  );
}
