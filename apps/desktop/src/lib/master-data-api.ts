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

export type MasterDataApi = {
  listProjectDefaults(): Promise<ProjectDefaultsView[]>
  saveProjectDefaults(defaults: ProjectDefaults): Promise<void>
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
}
