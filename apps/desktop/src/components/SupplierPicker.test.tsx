import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SupplierPicker } from './SupplierPicker'

describe('SupplierPicker selected labels before any directory read', () => {
  const countryId = '00000000-0000-4000-8000-000000000001'
  const supplierId = '00000000-0000-4000-8000-000000000002'

  it('uses a known supplier label without querying or displaying its UUID', () => {
    const listSuppliers = vi.fn(async () => [])
    const html = renderToStaticMarkup(
      <SupplierPicker
        api={{ listSuppliers }}
        countryId={countryId}
        value={supplierId}
        knownSupplier={{
          id: supplierId,
          businessCode: 'SYNTH',
          name: 'Synthetic supplier',
        }}
      />,
    )
    const text = html.replace(/<[^>]*>/g, '')
    expect(text).toContain('SYNTH · Synthetic supplier')
    expect(text).not.toContain(supplierId)
    expect(listSuppliers).not.toHaveBeenCalled()
  })

  it('uses an explicit fallback for an unknown selected supplier without a full read', () => {
    const listSuppliers = vi.fn(async () => [])
    const html = renderToStaticMarkup(
      <SupplierPicker
        api={{ listSuppliers }}
        countryId={countryId}
        value={supplierId}
      />,
    )
    const text = html.replace(/<[^>]*>/g, '')
    expect(text).toContain('已选供应商')
    expect(text).not.toContain(supplierId)
    expect(listSuppliers).not.toHaveBeenCalled()
  })
})
