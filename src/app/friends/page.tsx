import { Suspense } from "react";
import { acceptFriendRequest, removeFriendship } from "@/app/actions/friends";
import { ActionButton } from "@/components/action-button";
import { Card, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/dal";
import { getMyTransfers } from "@/lib/data";
import { fmtPoints, pointsClass } from "@/lib/format";
import { getFriends, getIncomingRequests, getOutgoingRequests, type PublicUser } from "@/lib/friends";
import { pairwiseBalances } from "@/lib/ledger";
import { AddFriendForm, UsernameForm } from "./forms";

function PersonRow({ person, children }: { person: PublicUser; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
      <span>
        <span className="font-medium">{person.name}</span> <span className="text-muted">@{person.username}</span>
      </span>
      <div className="flex items-center gap-1">{children}</div>
    </li>
  );
}

function PeopleList({ title, people, children }: { title: string; people: PublicUser[]; children: (p: PublicUser) => React.ReactNode }) {
  if (people.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{title}</SectionTitle>
      <Card className="p-0">
        <ul className="flex flex-col divide-y divide-border">
          {people.map((p) => (
            <PersonRow key={p.id} person={p}>
              {children(p)}
            </PersonRow>
          ))}
        </ul>
      </Card>
    </section>
  );
}

async function FriendsView() {
  const user = await requireUser();
  const [friends, incoming, outgoing, entries] = await Promise.all([
    getFriends(user.id),
    getIncomingRequests(user.id),
    getOutgoingRequests(user.id),
    getMyTransfers(user.id),
  ]);
  const balances = pairwiseBalances(entries).get(user.id);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8">
      <h1 className="text-2xl font-semibold">Friends</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium">Add a friend</h2>
          <AddFriendForm />
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium">Your username</h2>
          <UsernameForm current={user.username} />
          <p className="text-sm text-muted">Friends can find you as @{user.username}.</p>
        </Card>
      </div>

      <PeopleList title="Requests for you" people={incoming}>
        {(p) => (
          <>
            <ActionButton action={acceptFriendRequest.bind(null, p.id)} label="Accept" variant="primary" />
            <ActionButton action={removeFriendship.bind(null, p.id)} label="Decline" />
          </>
        )}
      </PeopleList>

      <PeopleList title="Requests you sent" people={outgoing}>
        {(p) => <ActionButton action={removeFriendship.bind(null, p.id)} label="Cancel" />}
      </PeopleList>

      {friends.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No friends yet. Friends can be added to markets straight away; anyone else has to accept first.
          </p>
        </Card>
      ) : (
        <PeopleList title="Your friends" people={friends}>
          {(p) => {
            const points = balances?.get(p.id) ?? 0;
            return (
              <>
                <span className={`mr-2 font-mono tabular-nums ${pointsClass(points)}`} title="Your head to head">
                  {fmtPoints(points)}
                </span>
                <ActionButton
                  action={removeFriendship.bind(null, p.id)}
                  label="Remove"
                  confirmText={`Remove ${p.name} as a friend? Your head-to-head record stays.`}
                />
              </>
            );
          }}
        </PeopleList>
      )}
    </div>
  );
}

export default function FriendsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <FriendsView />
    </Suspense>
  );
}
