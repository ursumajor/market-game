import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  // Lowercase, 3-20 of [a-z0-9_]; see USERNAME_RULE in lib/username.ts.
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    // SHA-256 of the cookie token, so a leaked database can't be used to log in.
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const groups = sqliteTable("groups", {
  id: id(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const groupMembers = sqliteTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["ADMIN", "MEMBER"] }).notNull().default("MEMBER"),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("group_members_user_idx").on(t.userId)],
);

export const markets = sqliteTable(
  "markets",
  {
    id: id(),
    // Null for a market played outside any group.
    groupId: text("group_id").references(() => groups.id, { onDelete: "cascade" }),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    question: text("question").notNull(),
    unit: text("unit"),
    makerId: text("maker_id")
      .notNull()
      .references(() => users.id),
    low: real("low").notNull(),
    high: real("high").notNull(),
    // PENDING: waiting for invited non-friends to accept. trueValue may already be
    // set, in which case the market resolves as soon as the last one accepts.
    status: text("status", { enum: ["PENDING", "OPEN", "RESOLVED", "VOID"] }).notNull().default("OPEN"),
    trueValue: real("true_value"),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
    // Set when this market is one MM's quote on a global question. A quote's
    // low/high never change: updating it closes this row to new trades and
    // opens a new one, so every trade keeps the price it was made at.
    questionId: text("question_id").references((): AnySQLiteColumn => globalQuestions.id, { onDelete: "cascade" }),
    acceptingTrades: integer("accepting_trades", { mode: "boolean" }).notNull().default(true),
    // Optional cap on trades against this quote, to limit the MM's exposure.
    maxTrades: integer("max_trades"),
    createdAt: createdAt(),
  },
  (t) => [index("markets_group_idx").on(t.groupId), index("markets_question_idx").on(t.questionId)],
);

export const positions = sqliteTable(
  "positions",
  {
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    side: text("side", { enum: ["HIGHER", "LOWER"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.marketId, t.userId] })],
);

/**
 * Written when a market resolves: one row per taker, moving points between the
 * taker and the MM. Every score (head to head, group leaderboards, dashboard
 * totals) is a sum over these rows; a market's group plays no part.
 */
export const transfers = sqliteTable(
  "transfers",
  {
    id: id(),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    makerId: text("maker_id")
      .notNull()
      .references(() => users.id),
    takerId: text("taker_id")
      .notNull()
      .references(() => users.id),
    raw: real("raw").notNull(),
    points: real("points").notNull(),
  },
  (t) => [
    index("transfers_market_idx").on(t.marketId),
    index("transfers_maker_idx").on(t.makerId),
    index("transfers_taker_idx").on(t.takerId),
  ],
);

/** A friend request from `requesterId`; becomes a friendship once accepted. One row per pair. */
export const friendships = sqliteTable(
  "friendships",
  {
    requesterId: text("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["PENDING", "ACCEPTED"] }).notNull().default("PENDING"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.requesterId, t.addresseeId] }), index("friendships_addressee_idx").on(t.addresseeId)],
);

/**
 * Someone added to a market (outside any group) by a person they aren't friends
 * with. The market stays PENDING until every row here is ACCEPTED; declining
 * removes the player from the market.
 */
export const marketApprovals = sqliteTable(
  "market_approvals",
  {
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["PENDING", "ACCEPTED"] }).notNull().default("PENDING"),
  },
  (t) => [primaryKey({ columns: [t.marketId, t.userId] }), index("market_approvals_user_idx").on(t.userId)],
);

/**
 * A public question anyone can make a market on (see markets.questionId) and
 * anyone can trade. The creator can't take part, and resolves it: they propose
 * the answer, which becomes final after a dispute window.
 */
export const globalQuestions = sqliteTable(
  "global_questions",
  {
    id: id(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    question: text("question").notNull(),
    unit: text("unit"),
    answerSource: text("answer_source").notNull(),
    // Trading stops at closesAt; whether that has passed is checked in SQL.
    closesAt: integer("closes_at", { mode: "timestamp" }).notNull(),
    // OPEN until an answer is proposed; PROPOSED during the dispute window.
    status: text("status", { enum: ["OPEN", "PROPOSED", "RESOLVED", "VOID"] }).notNull().default("OPEN"),
    trueValue: real("true_value"),
    disputeEndsAt: integer("dispute_ends_at", { mode: "timestamp" }),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
    createdAt: createdAt(),
  },
  (t) => [index("global_questions_closes_idx").on(t.closesAt)],
);

/** A participant's objection to a proposed answer; one per person per proposal. */
export const questionDisputes = sqliteTable(
  "question_disputes",
  {
    questionId: text("question_id")
      .notNull()
      .references(() => globalQuestions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.userId] })],
);
