import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { type MembershipRow, memberships } from '../db/schema';

export class MembershipRepo {
  constructor(private readonly db: Database) {}

  async listByServer(serverId: string): Promise<MembershipRow[]> {
    return this.db.select().from(memberships).where(eq(memberships.serverId, serverId));
  }

  async countByServer(serverId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(memberships)
      .where(eq(memberships.serverId, serverId));
    return row?.count ?? 0;
  }

  async isMember(serverId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.serverId, serverId), eq(memberships.userId, userId)));
    return Boolean(row);
  }
}
