import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migration-runner.js'
const url = process.env.TEST_DATABASE_URL,
  legacy = process.env.HONSEN_LEGACY_MIGRATIONS_DIR
const owner = url ? new Pool({ connectionString: url }) : null
describe.skipIf(!owner || !legacy)(
  'actual deployed 082 SQL to identity016',
  () => {
    afterAll(async () => owner!.end())
    for (const collision of [false, true])
      it(`bootstrapped deployed schema upgrade preserves all identity evidence collision=${collision}`, async () => {
        const name = 'deployed_identity_' + randomUUID().replaceAll('-', '')
        await owner!.query(`CREATE DATABASE "${name}"`)
        const connection = new URL(url!)
        connection.pathname = '/' + name
        const pool = new Pool({ connectionString: connection.toString() })
        try {
          await pool.query(
            'CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,checksum TEXT,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
          )
          const names = (await readdir(legacy!))
            .filter((n) => n.endsWith('.sql'))
            .sort()
          expect(names.at(-1)).toBe('015_protected_admin.sql')
          for (const file of names) {
            const sql = await readFile(join(legacy!, file), 'utf8')
            await pool.query('BEGIN')
            await pool.query(sql)
            await pool.query(
              'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
              [file, createHash('sha256').update(sql).digest('hex')],
            )
            await pool.query('COMMIT')
          }
          const password = randomUUID()
          execFileSync(
            process.execPath,
            ['--import', 'tsx', 'src/scripts/bootstrap-v1.ts'],
            {
              env: { ...process.env, POSTGRES_URL: connection.toString() },
              input: password + '\n',
              stdio: ['pipe', 'pipe', 'pipe'],
            },
          )
          const id = randomUUID()
          await pool.query(
            "INSERT INTO users(id,business_code,username,password_hash,ui_locale) VALUES($1::uuid,$1::text,'测试1','legacy-preserved-hash','zh-CN')",
            [id],
          )
          await pool.query(
            "INSERT INTO user_roles(user_id,role) VALUES($1,'engineer')",
            [id],
          )
          if (collision)
            await pool.query(
              "INSERT INTO users(id,business_code,username,password_hash,ui_locale) VALUES($1::uuid,$1::text,'ADMIN','collision-hash','zh-CN')",
              [randomUUID()],
            )
          const before = await pool.query(
            'SELECT id,username,password_hash,is_enabled,requires_password_change FROM users ORDER BY id',
          )
          const roles = await pool.query(
              'SELECT * FROM user_roles ORDER BY user_id,role',
            ),
            audit = await pool.query('SELECT * FROM audit_entries ORDER BY id')
          if (collision)
            await expect(runMigrations(pool)).rejects.toMatchObject({
              code: '23514',
            })
          else await runMigrations(pool)
          expect(
            (
              await pool.query(
                'SELECT id,username,password_hash,is_enabled,requires_password_change FROM users ORDER BY id',
              )
            ).rows,
          ).toEqual(before.rows)
          expect(
            (await pool.query('SELECT * FROM user_roles ORDER BY user_id,role'))
              .rows,
          ).toEqual(roles.rows)
          expect(
            (await pool.query('SELECT * FROM audit_entries ORDER BY id')).rows,
          ).toEqual(audit.rows)
          expect(
            (
              await pool.query(
                "SELECT name FROM schema_migrations WHERE name='016_account_identity.sql'",
              )
            ).rowCount,
          ).toBe(collision ? 0 : 1)
          await expect(
            pool.query(
              "UPDATE users SET is_enabled=FALSE WHERE username='admin'",
            ),
          ).rejects.toMatchObject({ code: '23514' })
        } finally {
          await pool.end()
          await owner!.query(`DROP DATABASE "${name}" WITH (FORCE)`)
        }
      })
  },
)
