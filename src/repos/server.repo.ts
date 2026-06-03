import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  type LobbyRow,
  type MembershipRow,
  type ServerRow,
  lobbies,
  memberships,
  servers,
} from '../db/schema';

export interface CreateServerInput {
  name: string;
  requiredPlayers: number;
  gameType: string;
  createdBy: string;
}

export type JoinResult =
  | { status: 'joined'; server: ServerRow; membership: MembershipRow }
  | { status: 'already_joined' }
  | { status: 'server_full' }
  | { status: 'not_found' };

// Internal sentinel used to roll back a transaction when a server is full.
class ServerFullSignal extends Error {}

export class ServerRepo {
  constructor(private readonly db: Database) {}

  async createWithLobby(input: CreateServerInput): Promise<{ server: ServerRow; lobby: LobbyRow }> {
    return this.db.transaction(async (tx) => {
      const [server] = await tx
        .insert(servers)
        .values({
          name: input.name,
          requiredPlayers: input.requiredPlayers,
          gameType: input.gameType,
          createdBy: input.createdBy,
        })
        .returning();

      const [lobby] = await tx
        .insert(lobbies)
        .values({ serverId: server.id, createdBy: input.createdBy })
        .returning();

      return { server, lobby };
    });
  }

  async listOpen(): Promise<ServerRow[]> {
    return this.db
      .select()
      .from(servers)
      .where(eq(servers.status, 'open'))
      .orderBy(desc(servers.createdAt));
  }

  async findById(id: string): Promise<ServerRow | undefined> {
    const [row] = await this.db.select().from(servers).where(eq(servers.id, id));
    return row;
  }

  /**
   * Race-free join. In a single transaction:
   *   1. Insert the membership (unique on server_id+user_id); no row -> already joined.
   *   2. Atomically increment current_players only while there is room, flipping
   *      status to 'full' on the last seat. No row -> server is full -> rollback.
   * The conditional UPDATE + row lock serialize concurrent joiners, so the count
   * can never exceed required_players without any queue.
   */
  async joinServer(serverId: string, userId: string): Promise<JoinResult> {
    const exists = await this.findById(serverId);
    if (!exists) return { status: 'not_found' };

    try {
      return await this.db.transaction(async (tx) => {
        const [membership] = await tx
          .insert(memberships)
          .values({ serverId, userId })
          .onConflictDoNothing({ target: [memberships.serverId, memberships.userId] })
          .returning();

        if (!membership) {
          return { status: 'already_joined' } as JoinResult;
        }

        /* Raw SQL query for below operation for reference
        UPDATE servers
        SET
          current_players = current_players + 1,
          status = CASE
                    WHEN current_players + 1 >= required_players THEN 'full'
                    ELSE status
                  END
        WHERE
          id = $serverId
          AND current_players < required_players
        RETURNING *;
        */
        const [updated] = await tx
          .update(servers)
          .set({
            currentPlayers: sql`${servers.currentPlayers} + 1`,
            status: sql`CASE WHEN ${servers.currentPlayers} + 1 >= ${servers.requiredPlayers} THEN 'full' ELSE ${servers.status} END`,
          })
          .where(
            and(
              eq(servers.id, serverId),
              sql`${servers.currentPlayers} < ${servers.requiredPlayers}`,
            ),
          )
          .returning();

        if (!updated) {
          throw new ServerFullSignal();
        }

        return { status: 'joined', server: updated, membership } as JoinResult;
      });
    } catch (err) {
      if (err instanceof ServerFullSignal) {
        return { status: 'server_full' };
      }
      throw err;
    }
  }
}
