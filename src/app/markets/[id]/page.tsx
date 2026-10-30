import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteMarket, reopenMarket, resolveMarket, respondToMarketInvite, voidMarket } from "@/app/actions/markets";
import { ActionButton } from "@/components/action-button";
import { Card, SectionTitle, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/dal";
import { getMarket, getMarketAccess } from "@/lib/data";
import { fmtDate, fmtNumber, fmtPoints, pointsClass } from "@/lib/format";
import { ResolveForm } from "./market-controls";

type Players = NonNullable<Awaited<ReturnType<typeof getMarket>>>["players"];

function SideList({ title, players }: { title: string; players: Players }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">
        {title} <span className="text-muted">({players.length})</span>
      </p>
      {players.length === 0 ? (
        <p className="text-sm text-muted">Nobody</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {players.map((p) => (
            <li key={p.userId}>{p.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function MarketView({ params }: { params: PageProps<"/markets/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await getMarket(id);
  const access = data && (await getMarketAccess(data.market, user.id));
  if (!data || !access) notFound();

  const { market, makerName, creatorName, players, results, approvals } = data;
  const waitingFor = approvals.filter((a) => a.status === "PENDING");
  const myInvite = market.status === "PENDING" && waitingFor.some((a) => a.userId === user.id);
  const { group, canManage } = access;
  const unit = market.unit ? ` ${market.unit}` : "";
  const quote = {
    makerId: market.makerId,
    low: market.low,
    high: market.high,
    positions: players.map(({ userId, side }) => ({ userId, side })),
  };
  const names: [string, string][] = [[market.makerId, makerName], ...players.map((p): [string, string] => [p.userId, p.name])];
  const resolve = resolveMarket.bind(null, market.id);

  const nameOf = new Map(names);
  const makerPoints = 0 - results.reduce((s, r) => s + r.points, 0);
  const resultRows = [
    ...results.map((r) => ({ id: r.takerId, name: nameOf.get(r.takerId) ?? "?", raw: r.raw, points: r.points, mm: false })),
    { id: market.makerId, name: makerName, raw: 0 - results.reduce((s, r) => s + r.raw, 0), points: makerPoints, mm: true },
  ].sort((a, b) => b.points - a.points);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={group ? `/groups/${group.id}` : "/"} className="text-sm text-muted hover:text-foreground">
          ← {group ? group.name : "Home"}
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">{market.question}</h1>
          <StatusBadge status={market.status} />
        </div>
        <p className="text-sm text-muted">
          {fmtDate(market.createdAt)}
          {!group && " · not in a group"}
        </p>
      </div>

      <Card className="flex flex-col gap-5">
        <div>
          <p className="text-sm text-muted">{makerName} made the market</p>
          <p className="font-mono text-2xl tabular-nums">
            {fmtNumber(market.low)} – {fmtNumber(market.high)}
            <span className="text-base text-muted">{unit}</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SideList title="Lower" players={players.filter((p) => p.side === "LOWER")} />
          <SideList title="Higher" players={players.filter((p) => p.side === "HIGHER")} />
        </div>
      </Card>

      {market.status === "RESOLVED" && market.trueValue !== null && (
        <section className="flex flex-col gap-3">
          <SectionTitle>
            Answer: {fmtNumber(market.trueValue)}
            {unit}
          </SectionTitle>
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 text-right font-medium">Raw</th>
                  <th className="px-4 py-3 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {resultRows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      {r.name}
                      {r.mm && <span className="text-muted"> (MM)</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-muted">{fmtNumber(r.raw)}</td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${pointsClass(r.points)}`}>{fmtPoints(r.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {market.status === "PENDING" && myInvite && (
        <Card className="flex flex-col gap-3 border-accent">
          <p>
            {creatorName} added you to this market
            {market.makerId === user.id ? " as the market maker" : ""}. You aren&apos;t friends, so it only counts if you
            accept.
          </p>
          <div className="flex gap-2">
            <ActionButton action={respondToMarketInvite.bind(null, market.id, true)} label="Accept" variant="primary" />
            <ActionButton
              action={respondToMarketInvite.bind(null, market.id, false)}
              label="Decline"
              confirmText={
                market.makerId === user.id
                  ? "Decline? You're the market maker, so the market will be voided."
                  : "Decline? You'll be removed from this market."
              }
            />
          </div>
        </Card>
      )}

      {market.status === "PENDING" && (
        <Card>
          <p className="text-sm text-muted">
            Waiting for {waitingFor.map((a) => a.name).join(", ")} to accept. Nobody scores until everyone has.
            {market.trueValue !== null && (
              <>
                {" "}
                The answer ({fmtNumber(market.trueValue)}
                {unit}) is recorded and applies as soon as they do.
              </>
            )}
          </p>
        </Card>
      )}

      {market.status === "VOID" && (
        <Card>
          <p className="text-sm text-muted">This market was voided, so nobody scored anything.</p>
        </Card>
      )}

      {canManage && (
        <section className="flex flex-col gap-3">
          {market.status === "OPEN" && (
            <Card className="flex flex-col gap-3">
              <h2 className="font-medium">Resolve</h2>
              <ResolveForm resolve={resolve} quote={quote} names={names} />
            </Card>
          )}
          {market.status === "PENDING" && (
            <Card className="flex flex-col gap-3">
              <h2 className="font-medium">{market.trueValue === null ? "Record the answer" : "Change the answer"}</h2>
              <ResolveForm
                resolve={resolve}
                quote={quote}
                names={names}
                initialValue={market.trueValue === null ? "" : String(market.trueValue)}
                submitLabel="Save"
              />
            </Card>
          )}
          {market.status === "RESOLVED" && (
            <Card>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Change the answer</summary>
                <div className="mt-3">
                  <ResolveForm
                    resolve={resolve}
                    quote={quote}
                    names={names}
                    initialValue={String(market.trueValue ?? "")}
                    submitLabel="Update"
                  />
                </div>
              </details>
            </Card>
          )}
          <div className="flex flex-wrap justify-end gap-1">
            {(market.status === "RESOLVED" || market.status === "VOID") && <ActionButton action={reopenMarket.bind(null, market.id)} label="Reopen" />}
            {market.status !== "VOID" && (
              <ActionButton
                action={voidMarket.bind(null, market.id)}
                label="Void"
                confirmText="Void this market? Nobody will score anything from it."
              />
            )}
            <ActionButton
              action={deleteMarket.bind(null, market.id)}
              label="Delete"
              confirmText="Delete this market permanently?"
            />
          </div>
        </section>
      )}
    </div>
  );
}

export default function MarketPage(props: PageProps<"/markets/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <MarketView params={props.params} />
    </Suspense>
  );
}
