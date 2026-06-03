import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { type LobbyRow, lobbies } from '../db/schema';

export class LobbyRepo {
  constructor(private readonly db: Database) {}

  async findByServerId(serverId: string): Promise<LobbyRow | undefined> {
    const [row] = await this.db.select().from(lobbies).where(eq(lobbies.serverId, serverId));
    return row;
  }
}
