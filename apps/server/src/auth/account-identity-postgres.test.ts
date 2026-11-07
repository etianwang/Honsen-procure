import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
const pool = process.env.TEST_DATABASE_URL
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL })
  : null
describe.skipIf(!pool)('016 identity migration atomic compatibility', () => {
  afterAll(async () => pool!.end())
  for (const collision of [false, true])
    it(`preserves legacy values and atomically rejects collisions=${collision}`, async () => {
      const c = await pool!.connect(),
        schema = 'identity_' + randomUUID().replaceAll('-', '')
      try {
        await c.query('BEGIN')
        await c.query(`CREATE SCHEMA ${schema}`)
        await c.query(`SET LOCAL search_path TO ${schema},public`)
        await c.query(
          'CREATE TABLE users(id uuid primary key,username text unique,password_hash text,roles text,audit text,deleted_at timestamptz)',
        )
        await c.query(
          "INSERT INTO users VALUES($1,'admin','unchangedhash','super_administrator','unchangedaudit',NULL),($2,'测试1','legacyhash','engineer','legacyaudit',NULL),($3,'AlphaUser','alphahash','purchaser','alphaaudit',NULL)",
          [randomUUID(), randomUUID(), randomUUID()],
        )
        if (collision)
          await c.query(
            "INSERT INTO users VALUES($1,'aLPHAuSER','collisionhash','viewer','collisionaudit',NOW())",
            [randomUUID()],
          )
        const before = (await c.query('SELECT * FROM users ORDER BY username'))
          .rows
        await c.query('SAVEPOINT migration')
        const sql = await readFile(
          new URL('../../migrations/016_account_identity.sql', import.meta.url),
          'utf8',
        )
        if (collision) {
          await expect(c.query(sql)).rejects.toMatchObject({ code: '23514' })
          await c.query('ROLLBACK TO SAVEPOINT migration')
          expect(
            (
              await c.query(
                "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND column_name='display_name'",
                [schema],
              )
            ).rowCount,
          ).toBe(0)
        } else {
          await c.query(sql)
          expect(
            (
              await c.query(
                'SELECT id,username,password_hash,roles,audit,deleted_at FROM users ORDER BY username',
              )
            ).rows,
          ).toEqual(before)
          await c.query('SAVEPOINT duplicate')
          await expect(
            c.query("INSERT INTO users(id,username) VALUES($1,'ALPHAUSER')", [
              randomUUID(),
            ]),
          ).rejects.toMatchObject({ code: '23505' })
          await c.query('ROLLBACK TO SAVEPOINT duplicate')
          expect(
            (
              await c.query(
                "SELECT username,display_name FROM users WHERE username='测试1'",
              )
            ).rows,
          ).toEqual([{ username: '测试1', display_name: null }])
        }
        expect(
          (
            await c.query(
              'SELECT id,username,password_hash,roles,audit,deleted_at FROM users ORDER BY username',
            )
          ).rows,
        ).toEqual(before)
      } finally {
        await c.query('ROLLBACK')
        c.release()
      }
    })
})
