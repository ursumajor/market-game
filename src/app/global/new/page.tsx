import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { getMyGroups } from "@/lib/data";
import { getFriends } from "@/lib/friends";
import { QuestionForm } from "./question-form";

async function NewQuestion({ searchParams }: { searchParams: PageProps<"/global/new">["searchParams"] }) {
  const user = await requireUser();
  const [{ group }, groups, friends] = await Promise.all([searchParams, getMyGroups(user.id), getFriends(user.id)]);
  // ?group=<id> preselects that group as the audience, if the user is in it.
  const initial = groups.find((g) => g.id === group);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={initial ? `/groups/${initial.id}` : "/global"} className="text-sm text-muted hover:text-foreground">
          ← {initial ? initial.name : "Online markets"}
        </Link>
        <h1 className="text-2xl font-semibold">Ask a question</h1>
      </div>
      <QuestionForm
        groups={groups.map(({ id, name }) => ({ id, name }))}
        friends={friends.map(({ id, name }) => ({ id, name }))}
        initialGroupId={initial?.id}
      />
    </div>
  );
}

export default function NewQuestionPage(props: PageProps<"/global/new">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <NewQuestion searchParams={props.searchParams} />
    </Suspense>
  );
}
