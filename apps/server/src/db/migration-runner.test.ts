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
    const result = await pool!.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('users', 'user_roles', 'account_sessions', 'countries', 'projects', 'departments', 'teams', 'audit_entries', 'sites', 'units', 'tax_templates', 'exchange_rates', 'project_print_defaults', 'sync_entities', 'sync_events', 'server_change_log', 'sync_conflicts')`,
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
      'tax_templates',
      'teams',
      'units',
      'user_roles',
      'users',
    ])
  })
})
