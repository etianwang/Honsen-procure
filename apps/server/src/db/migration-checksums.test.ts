import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isCompatibleMigrationChecksum as compatible } from './migration-checksums.js'

describe('exact pgcrypto declaration removal compatibility', () => {
  const name = '001_auth_and_master_data.sql'
  const sql = readFileSync(
    new URL('../../migrations/' + name, import.meta.url),
    'utf8',
  )
  const hash = (value: string) =>
    createHash('sha256').update(value).digest('hex')
  const current = hash(sql)
  const historical = hash('CREATE EXTENSION IF NOT EXISTS pgcrypto;\n' + sql)
  it('accepts only the exact original declaration removal', () => {
    expect(compatible(name, historical, current)).toBe(true)
    expect(compatible(name, current, current)).toBe(true)
    expect(sql).not.toMatch(/CREATE EXTENSION/i)
  })
  it('rejects body edits, another migration, unrelated history and reversal', () => {
    expect(compatible(name, historical, hash(sql + '\n-- changed'))).toBe(false)
    expect(compatible('002_catalog.sql', historical, current)).toBe(false)
    expect(compatible(name, '0'.repeat(64), current)).toBe(false)
    expect(compatible(name, current, historical)).toBe(false)
  })
})
