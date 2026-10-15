import { Alert } from 'antd'
import { useEffect, useState } from 'react'
import { ProjectDefaultsEditor } from '../components/ProjectDefaultsEditor'
import { MasterDataManager } from '../components/MasterDataManager'
import { TaxTemplateEditor } from '../components/TaxTemplateEditor'
import { ExchangeRateEditor } from '../components/ExchangeRateEditor'
import {
  tauriMasterDataApi,
  type ProjectDefaultsView,
  type ReferenceMasterDataView,
  type TaxTemplateView,
  type ExchangeRateView,
} from '../lib/master-data-api'
import type { UserRole } from '../lib/permissions'

export function MasterDataPage({ role }: { role: UserRole }) {
  const [projects, setProjects] = useState<ProjectDefaultsView[] | null>(null)
  const [referenceData, setReferenceData] = useState<
    ReferenceMasterDataView[] | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [taxTemplates, setTaxTemplates] = useState<TaxTemplateView[] | null>(
    null,
  )
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateView[] | null>(
    null,
  )

  useEffect(() => {
    Promise.all([
      tauriMasterDataApi.listProjectDefaults(),
      tauriMasterDataApi.listReferenceMasterData(),
      tauriMasterDataApi.listTaxTemplates(),
      tauriMasterDataApi.listExchangeRates(),
    ])
      .then(([defaults, reference, tax, rates]) => {
        setProjects(defaults)
        setReferenceData(reference)
        setTaxTemplates(tax)
        setExchangeRates(rates)
      })
      .catch(() => setError('无法读取本地基础资料'))
  }, [])

  if (error) return <Alert type="error" title={error} showIcon />
  if (!projects || !referenceData || !taxTemplates || !exchangeRates)
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
      <TaxTemplateEditor
        api={tauriMasterDataApi}
        templates={taxTemplates}
        countries={referenceData.filter((item) => item.kind === 'country')}
        canEdit={canEdit}
      />
      <ExchangeRateEditor
        api={tauriMasterDataApi}
        rates={exchangeRates}
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
