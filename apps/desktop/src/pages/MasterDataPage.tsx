import { useMasterText } from '../lib/master-data-messages'
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
  const t = useMasterText()
  const [category, setCategory] = useState('countries')
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

  if (error) return <Alert type="error" title={t(error)} showIcon />
  if (!projects || !referenceData || !taxTemplates || !exchangeRates)
    return <Alert type="info" title={t('正在读取本地基础资料')} showIcon />
  const canEdit = [
    'super_administrator',
    'administrator',
    'purchaser',
  ].includes(role)
  const groups = [
    {
      label: '组织资料',
      items: [
        ['countries', '国家'],
        ['projects', '项目'],
        ['sites', '项目站点'],
        ['departments', '部门'],
        ['teams', '团队'],
      ],
    },
    {
      label: '采购字典',
      items: [
        ['units', '单位'],
        ['material-categories', '材料分类'],
      ],
    },
    {
      label: '财务与打印',
      items: [
        ['tax-templates', '税模板维护'],
        ['exchange-rates', '汇率历史'],
        ['project-defaults', '项目默认设置'],
      ],
    },
  ]
  const referenceCategory = ![
    'tax-templates',
    'exchange-rates',
    'project-defaults',
  ].includes(category)
  const selectedLabel =
    groups
      .flatMap((group) => group.items)
      .find(([key]) => key === category)?.[1] ?? '国家'
  return (
    <section className="master-data-workspace">
      <nav className="master-data-navigation" aria-label={t('基础资料分类')}>
        {groups.map((group) => (
          <section className="master-data-nav-group" key={group.label}>
            <h3>{t(group.label)}</h3>
            {group.items.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={category === key}
                aria-controls={
                  [
                    'tax-templates',
                    'exchange-rates',
                    'project-defaults',
                  ].includes(key)
                    ? 'master-data-' + key + '-panel'
                    : 'master-data-reference-panel'
                }
                onClick={() => setCategory(key)}
              >
                {t(label)}
              </button>
            ))}
          </section>
        ))}
      </nav>
      <div className="master-data-detail">
        <header className="master-data-detail-header">
          <h2 id="master-data-detail-title">{t(selectedLabel)}</h2>
          <p>{t('切换分类会保留本页未保存的输入；离开本页前请保存。')}</p>
        </header>
        <section
          className="master-data-panel"
          id="master-data-reference-panel"
          hidden={!referenceCategory}
          aria-labelledby="master-data-detail-title"
        >
          <MasterDataManager
            api={tauriMasterDataApi}
            canMaintainCategories={
              role === 'administrator' || role === 'super_administrator'
            }
            activeCategory={referenceCategory ? category : 'countries'}
            records={referenceData}
            canEdit={canEdit}
          />
        </section>
        <section
          className="master-data-panel"
          id="master-data-tax-templates-panel"
          hidden={category !== 'tax-templates'}
          aria-label={t('税模板维护')}
        >
          <TaxTemplateEditor
            api={tauriMasterDataApi}
            templates={taxTemplates}
            countries={referenceData.filter((item) => item.kind === 'country')}
            canEdit={canEdit}
            onSaved={(template) =>
              setTaxTemplates((current) =>
                current?.some((item) => item.id === template.id)
                  ? current.map((item) =>
                      item.id === template.id ? template : item,
                    )
                  : [...(current ?? []), template],
              )
            }
          />
        </section>
        <section
          className="master-data-panel"
          id="master-data-exchange-rates-panel"
          hidden={category !== 'exchange-rates'}
          aria-label={t('汇率历史')}
        >
          <ExchangeRateEditor
            api={tauriMasterDataApi}
            rates={exchangeRates}
            canEdit={canEdit}
          />
        </section>
        <section
          className="master-data-panel"
          id="master-data-project-defaults-panel"
          hidden={category !== 'project-defaults'}
          aria-label={t('项目默认设置')}
        >
          <ProjectDefaultsEditor
            api={tauriMasterDataApi}
            projects={projects}
            referenceData={referenceData}
            taxTemplates={taxTemplates}
            canEdit={canEdit}
          />
        </section>
      </div>
    </section>
  )
}
