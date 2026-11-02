# Market Game

Make markets on numbers with friends and keep a running, zero-sum score per group.

## Rules as scored

The market maker (MM) quotes `[low, high]`; every other listed player says HIGHER or LOWER.
With true value `x`:

- HIGHER scores `(x - high) / |x|`
- LOWER scores `(low - x) / |x|`
- the MM scores minus the sum of everyone else

`x` can't be 0. Players who sat out a market just aren't listed. See `src/lib/scoring.ts`.

## How it works

- Anyone signed in can create a group and share its invite link (`/join/<code>`).
- Record a market at `/markets/new`: the MM, their range, and each player's side (players who sat
  out are left unset). Add the answer straight away or resolve it later.
- Everyone has a unique @username (log in with it or your email). Send friend requests by
  username or email on `/friends`; asking someone who already asked you makes you friends.
- A market is either in a group (players are its members, and it's listed on the group page) or
  in no group (friends in one click, anyone else by username or email; only the people involved
  can see it). Either way, scoring is the same.
- In a no-group market, anyone the recorder isn't friends with must accept before it counts. Until
  then it's PENDING; an answer entered meanwhile is kept and applied when the last person
  accepts. A taker who declines is removed; if the MM declines, the market is voided.
- The market's creator or its MM can resolve, change the answer, reopen, void or delete it; so can
  a group admin for group markets.
- Resolving writes one transfer per taker (MM ↔ taker). Points are head to head between pairs of
  players across every market. A group's leaderboard is each member's head-to-head total against
  the other members (including from markets outside the group); the dashboard shows your head to
  head with everyone.

## Online markets

At `/global`, anyone can ask a question (with where the answer will come from and when trading
closes) and pick who can see it:

- **Everyone**, **my friends** (whoever your friends are at the time), **one of your groups** (its
  members, and it's listed on the group page), or **specific people** (anyone, by username or email).
- Anyone who has made a market or traded on a question keeps seeing it, even if they later drop
  out of its audience. Open questions shared with you are listed on your dashboard.

Then everyone who can see it, the asker included:

- can **make a market** by posting a quote `low–high`, optionally capped at a number of trades.
  Updating or withdrawing a quote keeps trades already made at their price.
- can **trade any quote** except their own: buy at its high (scores `x − high`) or sell at its low
  (scores `low − x`), once per quote. Trades are final.

After trading closes, the asker proposes the answer. Participants have 24 hours to dispute it;
undisputed answers finalize on their own, disputed ones wait for the asker to change or confirm.
The asker can void a question at any time, unless they have trades on it: then voiding is a
proposal that stops trading and can be disputed the same way, so they can't cancel a losing position.

Each quote is a row in `markets` (with `question_id`) and each trade a `positions` row, so
resolution reuses the same scoring and transfers: global trades count in head to head and group
leaderboards like any other market. The order-book rules are in `src/lib/order-book.ts`.

## Development

Requires Node 24+ (installed via nvm).

```bash
npm install
npm run db:migrate   # creates local.db (SQLite) from drizzle/ migrations
npm run dev          # http://localhost:3000
npm test             # scoring + ledger unit tests
```

After changing `src/db/schema.ts`, run `npm run db:generate` and then `npm run db:migrate`.

`DATABASE_URL` (in `.env`) defaults to `file:local.db`. To deploy, point it at a Turso/libSQL
database and set `DATABASE_AUTH_TOKEN`.

## Stack

Next.js 16 (App Router, Cache Components) · Drizzle ORM + libSQL · Tailwind v4 · Vitest.
Auth is email/password (bcrypt) with database sessions (`src/lib/session.ts`).
