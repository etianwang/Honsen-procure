import {
  projectDefaultsSchema,
  type ProjectDefaults,
  referenceMasterDataSchema,
  type ReferenceMasterData,
  type Role,
  taxTemplateSchema,
  type TaxTemplate,
  exchangeRateSchema,
  type ExchangeRate,
} from '@honsen/shared'

export type MasterDataStore = {
  saveProjectDefaults(
    defaults: ProjectDefaults,
    actorId: string,
  ): Promise<ProjectDefaults>
  saveReferenceData(
    record: ReferenceMasterData,
    actorId: string,
  ): Promise<ReferenceMasterData>
  saveTaxTemplate(template: TaxTemplate, actorId: string): Promise<TaxTemplate>
  saveExchangeRate(rate: ExchangeRate, actorId: string): Promise<ExchangeRate>
}

export class MasterDataError extends Error {
  constructor(
    public readonly code:
      'FORBIDDEN' | 'INVALID_DEFAULTS' | 'IMMUTABLE_BUSINESS_CODE',
  ) {
    super(code)
  }
}

export class MasterDataService {
  constructor(private readonly store: MasterDataStore) {}

  async saveProjectDefaults(
    actor: { id: string; roles: Role[] },
    input: unknown,
  ): Promise<ProjectDefaults> {
    this.requireMasterDataRole(actor.roles)
    const parsed = projectDefaultsSchema.safeParse(input)
    if (!parsed.success) throw new MasterDataError('INVALID_DEFAULTS')
    return this.store.saveProjectDefaults(parsed.data, actor.id)
  }

  async saveReferenceData(
    actor: { id: string; roles: Role[] },
    input: unknown,
  ): Promise<ReferenceMasterData> {
    this.requireMasterDataRole(actor.roles)
    const parsed = referenceMasterDataSchema.safeParse(input)
    if (!parsed.success) throw new MasterDataError('INVALID_DEFAULTS')
    return this.store.saveReferenceData(parsed.data, actor.id)
  }

  async saveTaxTemplate(
    actor: { id: string; roles: Role[] },
    input: unknown,
  ): Promise<TaxTemplate> {
    this.requireMasterDataRole(actor.roles)
    const parsed = taxTemplateSchema.safeParse(input)
    if (!parsed.success) throw new MasterDataError('INVALID_DEFAULTS')
    return this.store.saveTaxTemplate(parsed.data, actor.id)
  }

  async saveExchangeRate(
    actor: { id: string; roles: Role[] },
    input: unknown,
  ): Promise<ExchangeRate> {
    this.requireMasterDataRole(actor.roles)
    const parsed = exchangeRateSchema.safeParse(input)
    if (!parsed.success) throw new MasterDataError('INVALID_DEFAULTS')
    return this.store.saveExchangeRate(parsed.data, actor.id)
  }

  private requireMasterDataRole(roles: Role[]): void {
    if (
      !roles.some((role) =>
        ['super_administrator', 'administrator', 'purchaser'].includes(role),
      )
    ) {
      throw new MasterDataError('FORBIDDEN')
    }
  }
}
