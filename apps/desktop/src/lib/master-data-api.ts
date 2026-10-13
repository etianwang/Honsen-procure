import type { ProjectDefaults } from '@honsen/shared'

export type ProjectDefaultsView = {
  projectId: string
  projectName: string
  site: string
  departmentTitle: string | null
  companyAddress: string | null
  companyContact: string | null
  defaultCurrency: ProjectDefaults['defaultCurrency']
  defaultLanguagePair: ProjectDefaults['defaultLanguagePair']
  defaultTaxTemplateId: string | null
  taxTemplateName: string | null
}

export type ReferenceMasterDataView =
  | {
      kind: 'country'
      id: string
      business_code: string
      name: string
      time_zone: string
      is_active: boolean
      version: number
    }
  | {
      kind: 'project'
      id: string
      country_id: string
      business_code: string
      name: string
      site: string
      department_name: string
      default_currency: 'XOF' | 'CNY' | 'USD' | 'EUR'
      default_language_pair: 'zh_fr' | 'zh_en'
      is_active: boolean
      version: number
    }
  | {
      kind: 'site'
      id: string
      project_id: string
      business_code: string
      name: string
      is_active: boolean
      version: number
    }

export type MasterDataApi = {
  listProjectDefaults(): Promise<ProjectDefaultsView[]>
  saveProjectDefaults(defaults: ProjectDefaults): Promise<void>
  listReferenceMasterData(): Promise<ReferenceMasterDataView[]>
  saveReferenceMasterData(record: ReferenceMasterDataView): Promise<void>
}

type TauriInvoke = <T>(command: string, args?: object) => Promise<T>

function tauriInvoke(): TauriInvoke {
  const invoke = (
    window as Window & {
      __TAURI__?: { core?: { invoke?: TauriInvoke } }
    }
  ).__TAURI__?.core?.invoke
  if (!invoke) throw new Error('桌面主机不可用')
  return invoke
}

export const tauriMasterDataApi: MasterDataApi = {
  listProjectDefaults: () =>
    tauriInvoke()<ProjectDefaultsView[]>('list_project_defaults'),
  saveProjectDefaults: (defaults) =>
    tauriInvoke()<void>('save_project_defaults', { defaults }),
  listReferenceMasterData: () =>
    tauriInvoke()<ReferenceMasterDataView[]>('list_reference_master_data'),
  saveReferenceMasterData: (record) =>
    tauriInvoke()<void>('save_reference_master_data', { record }),
}
