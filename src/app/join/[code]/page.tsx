import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { JoinButton } from "@/app/group-forms";
import { Card } from "@/components/ui";
import { db } from "@/db";
import { groupMembers, groups } from "@/db/schema";
import { requireUser } from "@/lib/dal";
import { getMembership } from "@/lib/data";

async function JoinView({ params }: { params: PageProps<"/join/[code]">["params"] }) {
  const user = await requireUser();
  const code = (await params).code.toUpperCase();
  const [group] = await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.inviteCode, code));

  if (!group) {
    return (
      <Card className="mx-auto max-w-sm text-center">
        <p className="mb-4">This invite link doesn&apos;t match any group.</p>
        <Link href="/" className="text-accent hover:underline">
          Back to your groups
        </Link>
      </Card>
    );
  }
  if (await getMembership(group.id, user.id)) redirect(`/groups/${group.id}`);

  const [{ n }] = await db.select({ n: count() }).from(groupMembers).where(eq(groupMembers.groupId, group.id));
  return (
    <Card className="mx-auto flex max-w-sm flex-col gap-4 text-center">
      <p className="text-sm text-muted">You&apos;ve been invited to</p>
      <h1 className="text-xl font-semibold">{group.name}</h1>
      <p className="text-sm text-muted">
        {n} {n === 1 ? "member" : "members"}
      </p>
      <JoinButton code={code} />
    </Card>
  );
}

export default function JoinPage(props: PageProps<"/join/[code]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <JoinView params={props.params} />
    </Suspense>
  );
}
