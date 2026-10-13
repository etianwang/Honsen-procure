import { Alert } from 'antd'
import { useEffect, useState } from 'react'
import { ProjectDefaultsEditor } from '../components/ProjectDefaultsEditor'
import { MasterDataManager } from '../components/MasterDataManager'
import {
  tauriMasterDataApi,
  type ProjectDefaultsView,
  type ReferenceMasterDataView,
} from '../lib/master-data-api'
import type { UserRole } from '../lib/permissions'

export function MasterDataPage({ role }: { role: UserRole }) {
  const [projects, setProjects] = useState<ProjectDefaultsView[] | null>(null)
  const [referenceData, setReferenceData] = useState<
    ReferenceMasterDataView[] | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      tauriMasterDataApi.listProjectDefaults(),
      tauriMasterDataApi.listReferenceMasterData(),
    ])
      .then(([defaults, reference]) => {
        setProjects(defaults)
        setReferenceData(reference)
      })
      .catch(() => setError('无法读取本地基础资料'))
  }, [])

  if (error) return <Alert type="error" title={error} showIcon />
  if (!projects || !referenceData)
    return <Alert type="info" title="正在读取本地基础资料" showIcon />
  const canEdit = [
    'super_administrator',
    'administrator',
    'purchaser',
  ].includes(role)
  return (
    <>
      <MasterDataManager
        api={tauriMasterDataApi}
        records={referenceData}
        canEdit={canEdit}
      />
      <ProjectDefaultsEditor
        api={tauriMasterDataApi}
        projects={projects}
        canEdit={canEdit}
      />
    </>
  )
}
