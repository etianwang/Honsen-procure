import type { PoolClient } from 'pg'
import type { SyncStore } from './types.js'

// Only direct storage fixtures may omit authority. Authenticated SyncService
// calls always carry the hash of the exact bearer session, never a renderer ID.
export async function lockLiveAuthority(
  client: PoolClient,
  input: Pick<
    Parameters<SyncStore['pushEvent']>[0],
    'actorId' | 'installationId' | 'authority'
  >,
): Promise<boolean> {
  if (!input.authority) return true
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('honsen:super-admin-protection',0))",
  )
  const users = await client.query<{ roles: string[] }>(
    `SELECT ARRAY(SELECT role FROM user_roles WHERE user_id=u.id ORDER BY role) AS roles FROM users u WHERE u.id=$1 AND u.is_enabled AND u.deleted_at IS NULL AND NOT u.requires_password_change FOR SHARE OF u`,
    [input.actorId],
  )
  const roles = users.rows[0]?.roles
  if (
    !roles ||
    JSON.stringify(roles) !== JSON.stringify([...input.authority.roles].sort())
  )
    return false
  const sessions = await client.query(
    `SELECT id FROM account_sessions WHERE user_id=$1 AND token_hash=$2 AND installation_id=$3 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE`,
    [input.actorId, input.authority.sessionTokenHash, input.installationId],
  )
  return sessions.rowCount === 1
}
