import { useState } from 'react'
import { ProjectDefaultsEditor } from '../components/ProjectDefaultsEditor'
import type { MasterDataApi, ProjectDefaultsView } from '../lib/master-data-api'
import type { ProjectDefaults } from '@honsen/shared'

const projects: ProjectDefaultsView[] = [
  {
    projectId: '43e62f6f-8069-460d-8fa5-16e4d4800cd4',
    projectName: 'Bethel2办公楼项目',
    site: 'Bethel2工地',
    departmentTitle: '科特迪瓦项目部',
    companyAddress: 'fixture address',
    companyContact: 'fixture contact',
    defaultCurrency: 'XOF',
    defaultLanguagePair: 'zh_fr',
    defaultTaxTemplateId: '8263003d-6a0f-4dd0-b6be-0b725eff684a',
    taxTemplateName: '科特迪瓦 TVA 18%',
  },
  {
    projectId: 'b10c8199-0545-4d2a-b35f-1f2c4c23e415',
    projectName: 'Minrex数据中心',
    site: 'Minrex数据中心',
    departmentTitle: '喀麦隆项目部',
    companyAddress: 'fixture address',
    companyContact: 'fixture contact',
    defaultCurrency: 'XOF',
    defaultLanguagePair: 'zh_en',
    defaultTaxTemplateId: null,
    taxTemplateName: null,
  },
]

export function MasterDataFixturePage() {
  const [, setLastSaved] = useState<ProjectDefaults | null>(null)
  const api: MasterDataApi = {
    async listProjectDefaults() {
      return projects
    },
    async saveProjectDefaults(defaults) {
      setLastSaved(defaults)
    },
  }

  return (
    <main className="fixture-page">
      <ProjectDefaultsEditor api={api} projects={projects} canEdit />
    </main>
  )
}
