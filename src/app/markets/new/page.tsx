import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { getMyGroupsWithMembers } from "@/lib/data";
import { getFriends } from "@/lib/friends";
import { MarketForm } from "./market-form";

async function NewMarket({ searchParams }: { searchParams: PageProps<"/markets/new">["searchParams"] }) {
  const user = await requireUser();
  const [{ group }, groups, friends] = await Promise.all([searchParams, getMyGroupsWithMembers(user.id), getFriends(user.id)]);
  // ?group=<id> preselects that group, if the user is in it.
  const initial = groups.find((g) => g.id === group);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={initial ? `/groups/${initial.id}` : "/"} className="text-sm text-muted hover:text-foreground">
          ← {initial ? initial.name : "Home"}
        </Link>
        <h1 className="text-2xl font-semibold">New market</h1>
      </div>
      <MarketForm me={{ id: user.id, name: user.name }} groups={groups} friends={friends.map(({ id, name }) => ({ id, name }))} initialGroupId={initial?.id ?? ""} />
    </div>
  );
}

export default function NewMarketPage(props: PageProps<"/markets/new">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <NewMarket searchParams={props.searchParams} />
    </Suspense>
  );
}
