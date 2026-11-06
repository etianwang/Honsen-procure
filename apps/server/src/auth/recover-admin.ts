import argon2 from 'argon2'
import type { Pool } from 'pg'
import { z } from 'zod'

const recoverySchema = z.strictObject({
  password: z.string().min(12).max(1024),
  operator: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(1).max(1000),
})

// Local maintenance operation only. Never register this as an HTTP endpoint.
export async function recoverAdmin(
  pool: Pool,
  input: unknown,
): Promise<string> {
  const data = recoverySchema.parse(input)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const owner = await client.query(
      `SELECT 1 FROM pg_class c WHERE c.oid='public.users'::regclass
       AND pg_get_userbyid(c.relowner)=current_user AND current_user=session_user`,
    )
    if (owner.rowCount !== 1) throw new Error('MAINTENANCE_OWNER_REQUIRED')
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('honsen:super-admin-protection',0))",
    )
    const result = await client.query<{ id: string }>(
      `SELECT u.id FROM users u WHERE u.username='admin' AND u.is_enabled
       AND u.deleted_at IS NULL AND EXISTS(SELECT 1 FROM user_roles r
       WHERE r.user_id=u.id AND r.role='super_administrator') FOR UPDATE`,
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error('PROTECTED_ADMIN_NOT_HEALTHY')
    const hash = await argon2.hash(data.password, { type: argon2.argon2id })
    await client.query(
      `UPDATE users SET password_hash=$2,failed_login_attempts=0,locked_until=NULL,
       requires_password_change=FALSE,updated_at=NOW() WHERE id=$1`,
      [id, hash],
    )
    await client.query(
      'UPDATE account_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',
      [id],
    )
    await client.query(
      `INSERT INTO audit_entries(id,actor_id,entity_type,entity_id,action,reason)
       VALUES(gen_random_uuid(),$1,'user',$1,'admin_password_recovered',$2)`,
      [
        id,
        JSON.stringify({
          operator: data.operator,
          reason: data.reason,
          maintenanceRole: (await client.query('SELECT current_user AS name'))
            .rows[0].name,
        }),
      ],
    )
    await client.query('COMMIT')
    return id
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
