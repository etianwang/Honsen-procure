import { Alert } from 'antd'
import { useEffect, useState } from 'react'
import { ProjectDefaultsEditor } from '../components/ProjectDefaultsEditor'
import {
  tauriMasterDataApi,
  type ProjectDefaultsView,
} from '../lib/master-data-api'
import type { UserRole } from '../lib/permissions'

export function MasterDataPage({ role }: { role: UserRole }) {
  const [projects, setProjects] = useState<ProjectDefaultsView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    tauriMasterDataApi
      .listProjectDefaults()
      .then(setProjects)
      .catch(() => setError('无法读取本地项目默认值'))
  }, [])

  if (error) return <Alert type="error" title={error} showIcon />
  if (!projects)
    return <Alert type="info" title="正在读取本地项目默认值" showIcon />
  return (
    <ProjectDefaultsEditor
      api={tauriMasterDataApi}
      projects={projects}
      canEdit={['super_administrator', 'administrator', 'purchaser'].includes(
        role,
      )}
    />
  )
}
