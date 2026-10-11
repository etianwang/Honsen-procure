import { describe, expect, it } from 'vitest'
import { canEditMaterials } from './permissions'

describe('canEditMaterials', () => {
  it('allows purchasers and administrators to maintain materials', () => {
    expect(canEditMaterials('purchaser')).toBe(true)
    expect(canEditMaterials('administrator')).toBe(true)
  })

  it('keeps engineer and viewer access read-only', () => {
    expect(canEditMaterials('engineer')).toBe(false)
    expect(canEditMaterials('viewer')).toBe(false)
  })
})
