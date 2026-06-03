import { z } from 'zod';
import type { LobbyRow, MembershipRow, ServerRow } from '../db/schema';
import { isPositiveEven } from '../helpers/validation';

export const createServerBodySchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(120),
    requiredPlayers: z
      .number({ invalid_type_error: 'requiredPlayers must be a number' })
      .int('requiredPlayers must be an integer')
      .refine(isPositiveEven, 'requiredPlayers must be a positive even number'),
  })
  .strict();

export type CreateServerBody = z.infer<typeof createServerBodySchema>;

export const serverIdParamsSchema = z.object({
  id: z.string().uuid('server id must be a valid uuid'),
});

export type ServerIdParams = z.infer<typeof serverIdParamsSchema>;

export interface ServerDTO {
  id: string;
  name: string;
  gameType: string;
  requiredPlayers: number;
  currentPlayers: number;
  status: string;
  createdBy: string;
  createdAt: string;
}

export interface LobbyDTO {
  id: string;
  serverId: string;
  createdBy: string;
  createdAt: string;
}

export function toServerDTO(row: ServerRow): ServerDTO {
  return {
    id: row.id,
    name: row.name,
    gameType: row.gameType,
    requiredPlayers: row.requiredPlayers,
    currentPlayers: row.currentPlayers,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toLobbyDTO(row: LobbyRow): LobbyDTO {
  return {
    id: row.id,
    serverId: row.serverId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface CreateServerResponse {
  server: ServerDTO;
  lobby: LobbyDTO;
}

export interface ServerDetailResponse {
  server: ServerDTO;
  lobby: LobbyDTO | null;
  memberCount: number;
}

export interface JoinServerResponse {
  server: ServerDTO;
  membership: { id: string; serverId: string; userId: string; joinedAt: string };
  lobby: LobbyDTO | null;
}

export function toMembershipDTO(row: MembershipRow) {
  return {
    id: row.id,
    serverId: row.serverId,
    userId: row.userId,
    joinedAt: row.joinedAt.toISOString(),
  };
}
