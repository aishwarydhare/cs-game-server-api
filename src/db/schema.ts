import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const servers = pgTable(
  'servers',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    gameType: text('game_type').notNull().default('bomb_defusal'),
    requiredPlayers: integer('required_players').notNull(),
    currentPlayers: integer('current_players').notNull().default(0),
    status: text('status', { enum: ['open', 'full', 'closed'] })
      .notNull()
      .default('open'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // GET /servers filters on status='open'; index keeps that lookup cheap.
    statusIdx: index('servers_status_idx').on(t.status),
    // Hard backstop on the atomic-join invariant: a seat count can never exceed capacity.
    capacityCheck: check(
      'servers_current_le_required',
      sql`${t.currentPlayers} <= ${t.requiredPlayers}`,
    ),
  }),
);

export const lobbies = pgTable('lobbies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  serverId: uuid('server_id')
    .notNull()
    .unique()
    .references(() => servers.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqMember: unique('memberships_server_user_unique').on(t.serverId, t.userId),
  }),
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: text('user_id').notNull(),
    key: text('key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    responseStatus: integer('response_status'),
    // Raw serialized response body, replayed verbatim so a replay is byte-identical.
    responseBody: text('response_body'),
    responseContentType: text('response_content_type'),
    state: text('state', { enum: ['in_progress', 'completed'] })
      .notNull()
      .default('in_progress'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.key] }),
  }),
);

export type ServerRow = typeof servers.$inferSelect;
export type NewServerRow = typeof servers.$inferInsert;
export type LobbyRow = typeof lobbies.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type IdempotencyRow = typeof idempotencyKeys.$inferSelect;
