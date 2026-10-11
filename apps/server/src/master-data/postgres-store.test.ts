import { describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { PostgresMasterDataStore } from './postgres-store.js'
import { MasterDataError } from './service.js'

describe('PostgresMasterDataStore', () => {
  it('rejects a changed business code for an existing record', async () => {
    const calls: string[] = []
    const client = {
      async query(text: string) {
        calls.push(text)
        if (text.startsWith('SELECT business_code')) {
          return { rows: [{ business_code: 'CI' }] }
        }
        return { rows: [] }
      },
      release() {},
    }
    const pool = {
      async connect() {
        return client
      },
    } as unknown as Pool
    const store = new PostgresMasterDataStore(pool)

    await expect(
      store.saveReferenceData(
        {
          kind: 'country',
          id: '8b1cdb58-2a3b-4b0e-aeec-d60bf52c50f6',
          businessCode: 'CM',
          name: 'Cameroon',
          timeZone: 'Africa/Douala',
          isActive: true,
        },
        '8a37f7e4-95ce-4a8b-962e-677a5dd80ddc',
      ),
    ).rejects.toEqual(new MasterDataError('IMMUTABLE_BUSINESS_CODE'))
    expect(calls).toContain('ROLLBACK')
    expect(calls.some((call) => call.startsWith('INSERT INTO countries'))).toBe(
      false,
    )
  })
})
