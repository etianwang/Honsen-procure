import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from './migration-runner.js'

const databaseUrl = process.env.TEST_DATABASE_URL
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null

describe.skipIf(!pool)('PostgreSQL migrations', () => {
  beforeAll(async () => {
    await runMigrations(pool!)
  })

  afterAll(async () => {
    await pool!.end()
  })

  it('creates the account, master-data and sync foundation', async () => {
    await runMigrations(pool!)
    const result = await pool!.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('users', 'user_roles', 'account_sessions', 'countries', 'projects', 'departments', 'teams', 'audit_entries', 'sites', 'units', 'tax_templates', 'exchange_rates', 'project_print_defaults', 'sync_entities', 'sync_events', 'server_change_log', 'sync_conflicts', 'sync_origin_quarantine')`,
    )
    expect(result.rows.map((row) => row.table_name).sort()).toEqual([
      'account_sessions',
      'audit_entries',
      'countries',
      'departments',
      'exchange_rates',
      'project_print_defaults',
      'projects',
      'server_change_log',
      'sites',
      'sync_conflicts',
      'sync_entities',
      'sync_events',
      'sync_origin_quarantine',
      'tax_templates',
      'teams',
      'units',
      'user_roles',
      'users',
    ])
  })

  it('waits for the database lock before running migrations', async () => {
    const client = await pool!.connect()
    let released = false
    try {
      await client.query(
        "SELECT pg_advisory_lock(hashtextextended('honsen-procure:migrations', 0))",
      )
      const second = runMigrations(pool!)
      let waiting = false
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        const result = await client.query<{ waiting: boolean }>(
          "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event = 'advisory' AND query LIKE '%honsen-procure:migrations%') AS waiting",
        )
        waiting = result.rows[0]!.waiting
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20))
      }
      expect(waiting).toBe(true)
      await client.query(
        "SELECT pg_advisory_unlock(hashtextextended('honsen-procure:migrations', 0))",
      )
      released = true
      await second
    } finally {
      if (!released)
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended('honsen-procure:migrations', 0))",
        )
      client.release()
    }
  })

  it('allows an optional contact without losing a row from the prior schema', async () => {
    const client = await pool!.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        'CREATE TEMP TABLE project_print_defaults (project_id UUID PRIMARY KEY, company_contact TEXT NOT NULL) ON COMMIT DROP',
      )
      await client.query(
        "INSERT INTO project_print_defaults (project_id, company_contact) VALUES ('00000000-0000-4000-8000-000000000111', 'previous contact')",
      )
      const migration = await readFile(
        new URL(
          '../../migrations/005_nullable_project_default_contact.sql',
          import.meta.url,
        ),
        'utf8',
      )
      await client.query(migration)
      expect(
        (
          await client.query(
            'SELECT company_contact FROM project_print_defaults',
          )
        ).rows[0],
      ).toMatchObject({ company_contact: 'previous contact' })
      await client.query(
        "UPDATE project_print_defaults SET company_contact = NULL WHERE project_id = '00000000-0000-4000-8000-000000000111'",
      )
      expect(
        (
          await client.query(
            'SELECT company_contact FROM project_print_defaults',
          )
        ).rows[0],
      ).toMatchObject({ company_contact: null })
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })
})
