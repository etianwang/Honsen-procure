import { Alert, Button, Card, Input, Select, Space, Typography } from 'antd'
import type { ProjectDefaults } from '@honsen/shared'
import { useState } from 'react'
import type { MasterDataApi, ProjectDefaultsView } from '../lib/master-data-api'

type ProjectDefaultsEditorProps = {
  api: MasterDataApi
  projects: ProjectDefaultsView[]
  canEdit: boolean
}

function initialDraft(project: ProjectDefaultsView): ProjectDefaults {
  return {
    projectId: project.projectId,
    departmentTitle: project.departmentTitle ?? '',
    companyAddress: project.companyAddress ?? '',
    companyContact: project.companyContact ?? '',
    defaultCurrency: project.defaultCurrency,
    defaultLanguagePair: project.defaultLanguagePair,
    defaultTaxTemplateId: project.defaultTaxTemplateId,
  }
}

export function ProjectDefaultsEditor({
  api,
  projects,
  canEdit,
}: ProjectDefaultsEditorProps) {
  const [projectId, setProjectId] = useState(projects[0]?.projectId ?? '')
  const project = projects.find((item) => item.projectId === projectId)
  const [draft, setDraft] = useState<ProjectDefaults | null>(
    project ? initialDraft(project) : null,
  )
  const [message, setMessage] = useState<string | null>(null)

  if (!project || !draft) {
    return <Alert type="info" title="尚无可维护的同步项目" showIcon />
  }

  const incomplete = [
    draft.departmentTitle,
    draft.companyAddress,
    draft.companyContact,
  ].some((value) => value.trim() === '')

  async function save(): Promise<void> {
    if (!draft) return
    const defaults = draft
    try {
      await api.saveProjectDefaults(defaults)
      setMessage('项目默认值已保存')
    } catch {
      setMessage('保存失败，请确认桌面会话和本地数据状态')
    }
  }

  return (
    <Card>
      <Space
        orientation="vertical"
        size="large"
        className="project-default-editor"
      >
        <div>
          <Typography.Title level={1}>项目默认设置</Typography.Title>
          <Typography.Paragraph>
            管理员、采购员或超级管理员可维护打印抬头、币种、语言和税模板。业务编码不可在此更改。
          </Typography.Paragraph>
        </div>
        <label htmlFor="project-default-select">选择项目</label>
        <Select
          id="project-default-select"
          aria-label="选择项目"
          value={projectId}
          onChange={(nextProjectId: string) => {
            const nextProject = projects.find(
              (item) => item.projectId === nextProjectId,
            )
            setProjectId(nextProjectId)
            setDraft(nextProject ? initialDraft(nextProject) : null)
            setMessage(null)
          }}
          options={projects.map((item) => ({
            value: item.projectId,
            label: item.projectName,
          }))}
        />
        <output data-testid="selected-project">{project.projectName}</output>
        <dl className="master-defaults" aria-label="项目默认值">
          <div>
            <dt>工程地点</dt>
            <dd>{project.site}</dd>
          </div>
          <div>
            <dt>默认文件语言</dt>
            <dd>
              {draft.defaultLanguagePair === 'zh_fr'
                ? '中文 + 法语'
                : '中文 + 英文'}
            </dd>
          </div>
          <div>
            <dt>默认币种</dt>
            <dd>{draft.defaultCurrency}</dd>
          </div>
          <div>
            <dt>默认税率</dt>
            <dd>{project.taxTemplateName ?? '未设置默认税率'}</dd>
          </div>
        </dl>
        <label htmlFor="project-department-title">项目部抬头</label>
        <Input
          id="project-department-title"
          value={draft.departmentTitle}
          onChange={(event) =>
            setDraft({ ...draft, departmentTitle: event.target.value })
          }
          disabled={!canEdit}
        />
        <label htmlFor="project-address">页脚地址</label>
        <Input
          id="project-address"
          value={draft.companyAddress}
          onChange={(event) =>
            setDraft({ ...draft, companyAddress: event.target.value })
          }
          disabled={!canEdit}
        />
        <label htmlFor="project-contact">页脚联系方式</label>
        <Input
          id="project-contact"
          aria-label="页脚联系方式"
          value={draft.companyContact}
          onChange={(event) =>
            setDraft({ ...draft, companyContact: event.target.value })
          }
          disabled={!canEdit}
        />
        <label htmlFor="project-currency">默认币种</label>
        <Select
          id="project-currency"
          aria-label="默认币种"
          value={draft.defaultCurrency}
          disabled={!canEdit}
          onChange={(defaultCurrency: ProjectDefaults['defaultCurrency']) =>
            setDraft({ ...draft, defaultCurrency })
          }
          options={['XOF', 'CNY', 'USD', 'EUR'].map((value) => ({
            value,
            label: value,
          }))}
        />
        <label htmlFor="project-language">默认文件语言</label>
        <Select
          id="project-language"
          aria-label="默认文件语言"
          value={draft.defaultLanguagePair}
          disabled={!canEdit}
          onChange={(
            defaultLanguagePair: ProjectDefaults['defaultLanguagePair'],
          ) => setDraft({ ...draft, defaultLanguagePair })}
          options={[
            { value: 'zh_fr', label: '中文 + 法语' },
            { value: 'zh_en', label: '中文 + 英文' },
          ]}
        />
        <label htmlFor="project-tax-template">默认税模板 ID（可选）</label>
        <Input
          id="project-tax-template"
          value={draft.defaultTaxTemplateId ?? ''}
          onChange={(event) =>
            setDraft({
              ...draft,
              defaultTaxTemplateId: event.target.value.trim() || null,
            })
          }
          disabled={!canEdit}
        />
        <Button type="primary" onClick={save} disabled={!canEdit || incomplete}>
          保存项目默认值
        </Button>
        {message && (
          <Alert
            type={message === '项目默认值已保存' ? 'success' : 'error'}
            title={message}
            showIcon
          />
        )}
      </Space>
    </Card>
  )
}
