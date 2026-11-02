import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { QuestionForm } from "./question-form";

async function NewQuestion() {
  await requireUser();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/global" className="text-sm text-muted hover:text-foreground">
          ← Global markets
        </Link>
        <h1 className="text-2xl font-semibold">Ask a question</h1>
      </div>
      <QuestionForm />
    </div>
  );
}

export default function NewQuestionPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <NewQuestion />
    </Suspense>
  );
}
