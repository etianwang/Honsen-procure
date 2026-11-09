import { describe, expect, it } from 'vitest'
import {
  exchangeRateSchema,
  projectDefaultsSchema,
  referenceMasterDataSchema,
  taxTemplateSchema,
} from './master-data.js'

const projectId = '00000000-0000-4000-8000-000000000001'

describe('master-data contracts', () => {
  it('accepts project print defaults with an explicit supported currency', () => {
    expect(
      projectDefaultsSchema.parse({
        projectId,
        departmentTitle: '科特迪瓦项目部',
        companyAddress: 'fixture address',
        companyContact: 'fixture contact',
        defaultCurrency: 'XOF',
        defaultLanguagePair: 'zh_fr',
        defaultTaxTemplateId: null,
      }),
    ).toMatchObject({ defaultCurrency: 'XOF' })
    expect(
      projectDefaultsSchema.parse({
        projectId,
        departmentTitle: 'Procurement',
        companyAddress: 'fixture address',
        companyContact: null,
        defaultCurrency: 'XOF',
        defaultLanguagePair: 'zh_fr',
        defaultTaxTemplateId: null,
      }).companyContact,
    ).toBeNull()
  })

  it('accepts only whitelisted reference master-data kinds', () => {
    expect(
      referenceMasterDataSchema.parse({
        kind: 'country',
        id: projectId,
        businessCode: 'CI',
        name: 'Côte d’Ivoire',
        timeZone: 'Africa/Abidjan',
        isActive: true,
      }),
    ).toMatchObject({ kind: 'country', businessCode: 'CI' })
    expect(() =>
      referenceMasterDataSchema.parse({
        kind: 'arbitrary_table',
        id: projectId,
      }),
    ).toThrow()
  })

  it('rejects a floating-point tax rate at the transport boundary', () => {
    expect(() =>
      taxTemplateSchema.parse({
        id: projectId,
        businessCode: 'CI-TVA',
        name: 'fixture tax',
        countryId: null,
        rateBasisPoints: 1800.5,
        effectiveAt: '2026-10-10',
        isActive: true,
      }),
    ).toThrow()
  })

  it('requires an audit reason for a manual exchange rate', () => {
    expect(() =>
      exchangeRateSchema.parse({
        id: projectId,
        fromCurrency: 'USD',
        toCurrency: 'XOF',
        rateDecimal: '610.12',
        effectiveAt: '2026-10-10',
        source: 'manual',
        reason: null,
      }),
    ).toThrow()
  })
})
