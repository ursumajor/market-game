import { Suspense } from "react";
import { QuestionSection } from "@/components/question-list";
import { ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/dal";
import { finalizeDueQuestions, listQuestions } from "@/lib/global";

async function GlobalView() {
  const user = await requireUser();
  await finalizeDueQuestions();
  const questions = await listQuestions(user.id);
  const open = questions.filter((q) => q.status === "OPEN" && !q.closed);
  const awaiting = questions.filter((q) => (q.status === "OPEN" && q.closed) || q.status === "PROPOSED");
  const settled = questions.filter((q) => q.status === "RESOLVED" || q.status === "VOID").reverse();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Online markets</h1>
          <p className="text-sm text-muted">Public questions, and ones shared with you. Make a market on any of them, or trade.</p>
        </div>
        <ButtonLink href="/global/new">Ask a question</ButtonLink>
      </div>
      <QuestionSection title="Trading now" rows={open} empty="No open questions. Ask one!" />
      <QuestionSection title="Waiting for the answer" rows={awaiting} />
      <QuestionSection title="Settled" rows={settled} />
    </div>
  );
}

export default function GlobalPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <GlobalView />
    </Suspense>
  );
}
