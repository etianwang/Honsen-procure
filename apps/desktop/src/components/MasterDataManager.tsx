import { Alert, Button, Card, Input, Select, Space, Table, Tabs } from 'antd'
import { useMemo, useState, type ReactNode } from 'react'
import type {
  MasterDataApi,
  ReferenceMasterDataView,
} from '../lib/master-data-api'

type Props = {
  api: MasterDataApi
  records: ReferenceMasterDataView[]
  canEdit: boolean
}

const newId = () => crypto.randomUUID()

export function MasterDataManager({ api, records, canEdit }: Props) {
  const [items, setItems] = useState(records)
  const [message, setMessage] = useState<string | null>(null)
  const countries = useMemo(
    () =>
      items.filter(
        (item): item is Extract<ReferenceMasterDataView, { kind: 'country' }> =>
          item.kind === 'country',
      ),
    [items],
  )
  const projects = useMemo(
    () =>
      items.filter(
        (item): item is Extract<ReferenceMasterDataView, { kind: 'project' }> =>
          item.kind === 'project',
      ),
    [items],
  )
  const sites = useMemo(
    () =>
      items.filter(
        (item): item is Extract<ReferenceMasterDataView, { kind: 'site' }> =>
          item.kind === 'site',
      ),
    [items],
  )
  const units = useMemo(
    () =>
      items.filter(
        (item): item is Extract<ReferenceMasterDataView, { kind: 'unit' }> =>
          item.kind === 'unit',
      ),
    [items],
  )
  const departments = useMemo(
    () =>
      items.filter(
        (
          item,
        ): item is Extract<ReferenceMasterDataView, { kind: 'department' }> =>
          item.kind === 'department',
      ),
    [items],
  )
  const teams = useMemo(
    () =>
      items.filter(
        (item): item is Extract<ReferenceMasterDataView, { kind: 'team' }> =>
          item.kind === 'team',
      ),
    [items],
  )

  async function save(record: ReferenceMasterDataView) {
    try {
      await api.saveReferenceMasterData(record)
      setItems((current) => {
        const index = current.findIndex((item) => item.id === record.id)
        return index < 0
          ? [...current, record]
          : current.map((item) => (item.id === record.id ? record : item))
      })
      setMessage('基础资料已保存；等待同步确认')
    } catch {
      setMessage('保存被拒绝，请检查权限或关联资料')
    }
  }

  function status(record: ReferenceMasterDataView) {
    return (
      <Button
        disabled={!canEdit}
        size="small"
        onClick={() =>
          void save({
            ...record,
            is_active: !record.is_active,
            version: record.version + 1,
          })
        }
      >
        {record.is_active ? '停用' : '启用'}
      </Button>
    )
  }

  return (
    <Card title="管理员基础资料" aria-label="管理员基础资料">
      {message && <Alert type="info" title={message} showIcon />}
      <Tabs
        items={[
          {
            key: 'countries',
            label: '国家',
            children: (
              <CountryEditor
                countries={countries}
                canEdit={canEdit}
                save={save}
                status={status}
              />
            ),
          },
          {
            key: 'projects',
            label: '项目',
            children: (
              <ProjectEditor
                countries={countries}
                projects={projects}
                canEdit={canEdit}
                save={save}
                status={status}
              />
            ),
          },
          {
            key: 'sites',
            label: '项目站点',
            children: (
              <SiteEditor
                projects={projects}
                sites={sites}
                canEdit={canEdit}
                save={save}
                status={status}
              />
            ),
          },
          {
            key: 'units',
            label: '单位',
            children: (
              <UnitEditor
                units={units}
                canEdit={canEdit}
                save={save}
                status={status}
              />
            ),
          },
          {
            key: 'departments',
            label: '部门',
            children: (
              <DepartmentEditor
                departments={departments}
                canEdit={canEdit}
                save={save}
                status={status}
              />
            ),
          },
          {
            key: 'teams',
            label: '团队',
            children: (
              <TeamEditor
                departments={departments}
                teams={teams}
                canEdit={canEdit}
                save={save}
                status={status}
              />
            ),
          },
        ]}
      />
    </Card>
  )
}

function DepartmentEditor({
  departments,
  canEdit,
  save,
  status,
}: {
  departments: Extract<ReferenceMasterDataView, { kind: 'department' }>[]
  canEdit: boolean
  save: (item: ReferenceMasterDataView) => Promise<void>
  status: (item: ReferenceMasterDataView) => ReactNode
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Space wrap>
        <Input
          aria-label="部门代码"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={!canEdit}
        />
        <Input
          aria-label="部门名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canEdit}
        />
        <Button
          disabled={!canEdit || !code.trim() || !name.trim()}
          onClick={() =>
            void save({
              kind: 'department',
              id: newId(),
              business_code: code.trim(),
              name: name.trim(),
              is_active: true,
              version: 1,
            })
          }
        >
          新增部门
        </Button>
      </Space>
      <Table
        rowKey="id"
        pagination={false}
        dataSource={departments}
        columns={[
          { title: '代码', dataIndex: 'business_code' },
          {
            title: '名称',
            render: (_, row) => (
              <Input
                aria-label={`编辑部门名称-${row.business_code}`}
                defaultValue={row.name}
                disabled={!canEdit}
                onBlur={(event) => {
                  if (event.target.value !== row.name)
                    void save({
                      ...row,
                      name: event.target.value,
                      version: row.version + 1,
                    })
                }}
              />
            ),
          },
          { title: '状态', render: (_, row) => status(row) },
        ]}
      />
    </Space>
  )
}

function TeamEditor({
  departments,
  teams,
  canEdit,
  save,
  status,
}: {
  departments: Extract<ReferenceMasterDataView, { kind: 'department' }>[]
  teams: Extract<ReferenceMasterDataView, { kind: 'team' }>[]
  canEdit: boolean
  save: (item: ReferenceMasterDataView) => Promise<void>
  status: (item: ReferenceMasterDataView) => ReactNode
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Space wrap>
        <Input
          aria-label="团队代码"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={!canEdit}
        />
        <Input
          aria-label="团队名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canEdit}
        />
        <Select
          aria-label="团队所属部门"
          value={departmentId || undefined}
          onChange={setDepartmentId}
          options={departments
            .filter((department) => department.is_active)
            .map((department) => ({
              value: department.id,
              label: department.name,
            }))}
          disabled={!canEdit}
          placeholder="选择部门"
        />
        <Button
          disabled={!canEdit || !code.trim() || !name.trim() || !departmentId}
          onClick={() =>
            void save({
              kind: 'team',
              id: newId(),
              department_id: departmentId,
              business_code: code.trim(),
              name: name.trim(),
              is_active: true,
              version: 1,
            })
          }
        >
          新增团队
        </Button>
      </Space>
      <Table
        rowKey="id"
        pagination={false}
        dataSource={teams}
        columns={[
          { title: '代码', dataIndex: 'business_code' },
          {
            title: '名称',
            render: (_, row) => (
              <Input
                aria-label={`编辑团队名称-${row.business_code}`}
                defaultValue={row.name}
                disabled={!canEdit}
                onBlur={(event) => {
                  if (event.target.value !== row.name)
                    void save({
                      ...row,
                      name: event.target.value,
                      version: row.version + 1,
                    })
                }}
              />
            ),
          },
          {
            title: '部门',
            render: (_, row) =>
              departments.find(
                (department) => department.id === row.department_id,
              )?.name ?? '未知部门',
          },
          { title: '状态', render: (_, row) => status(row) },
        ]}
      />
    </Space>
  )
}

function UnitEditor({
  units,
  canEdit,
  save,
  status,
}: {
  units: Extract<ReferenceMasterDataView, { kind: 'unit' }>[]
  canEdit: boolean
  save: (item: ReferenceMasterDataView) => Promise<void>
  status: (item: ReferenceMasterDataView) => ReactNode
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Space wrap>
        <Input
          aria-label="单位代码"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={!canEdit}
        />
        <Input
          aria-label="单位名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canEdit}
        />
        <Button
          disabled={!canEdit || !code.trim() || !name.trim()}
          onClick={() =>
            void save({
              kind: 'unit',
              id: newId(),
              business_code: code.trim(),
              name: name.trim(),
              is_active: true,
              version: 1,
            })
          }
        >
          新增单位
        </Button>
      </Space>
      <Table
        rowKey="id"
        pagination={false}
        dataSource={units}
        columns={[
          { title: '代码', dataIndex: 'business_code' },
          {
            title: '名称',
            render: (_, row) => (
              <Input
                aria-label={`编辑单位名称-${row.business_code}`}
                defaultValue={row.name}
                disabled={!canEdit}
                onBlur={(event) => {
                  if (event.target.value !== row.name)
                    void save({
                      ...row,
                      name: event.target.value,
                      version: row.version + 1,
                    })
                }}
              />
            ),
          },
          { title: '状态', render: (_, row) => status(row) },
        ]}
      />
    </Space>
  )
}

function CountryEditor({
  countries,
  canEdit,
  save,
  status,
}: {
  countries: Extract<ReferenceMasterDataView, { kind: 'country' }>[]
  canEdit: boolean
  save: (item: ReferenceMasterDataView) => Promise<void>
  status: (item: ReferenceMasterDataView) => ReactNode
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [timeZone, setTimeZone] = useState('Africa/Abidjan')
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Space wrap>
        <Input
          aria-label="国家代码"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="国家代码"
          disabled={!canEdit}
        />
        <Input
          aria-label="国家名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="国家名称"
          disabled={!canEdit}
        />
        <Input
          aria-label="国家时区"
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
          placeholder="时区"
          disabled={!canEdit}
        />
        <Button
          disabled={!canEdit}
          onClick={() =>
            void save({
              kind: 'country',
              id: newId(),
              business_code: code,
              name,
              time_zone: timeZone,
              is_active: true,
              version: 1,
            })
          }
        >
          新增国家
        </Button>
      </Space>
      <Table
        rowKey="id"
        pagination={false}
        dataSource={countries}
        columns={[
          { title: '代码', dataIndex: 'business_code' },
          {
            title: '名称',
            render: (_, row) => (
              <Input
                aria-label={`编辑国家名称-${row.business_code}`}
                defaultValue={row.name}
                disabled={!canEdit}
                onBlur={(event) => {
                  if (event.target.value !== row.name)
                    void save({
                      ...row,
                      name: event.target.value,
                      version: row.version + 1,
                    })
                }}
              />
            ),
          },
          {
            title: '时区',
            render: (_, row) => (
              <Input
                aria-label={`编辑国家时区-${row.business_code}`}
                defaultValue={row.time_zone}
                disabled={!canEdit}
                onBlur={(event) => {
                  if (event.target.value !== row.time_zone)
                    void save({
                      ...row,
                      time_zone: event.target.value,
                      version: row.version + 1,
                    })
                }}
              />
            ),
          },
          { title: '状态', render: (_, row) => status(row) },
        ]}
      />
    </Space>
  )
}

function ProjectEditor({
  countries,
  projects,
  canEdit,
  save,
  status,
}: {
  countries: Extract<ReferenceMasterDataView, { kind: 'country' }>[]
  projects: Extract<ReferenceMasterDataView, { kind: 'project' }>[]
  canEdit: boolean
  save: (item: ReferenceMasterDataView) => Promise<void>
  status: (item: ReferenceMasterDataView) => ReactNode
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [countryId, setCountryId] = useState('')
  const [site, setSite] = useState('')
  const [department, setDepartment] = useState('')
  const [currency, setCurrency] = useState<'XOF' | 'CNY' | 'USD' | 'EUR'>('XOF')
  const [language, setLanguage] = useState<'zh_fr' | 'zh_en'>('zh_fr')
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Space wrap>
        <Input
          aria-label="项目代码"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="项目代码"
          disabled={!canEdit}
        />
        <Select
          aria-label="项目默认币种"
          value={currency}
          onChange={setCurrency}
          options={['XOF', 'CNY', 'USD', 'EUR'].map((value) => ({
            value,
            label: value,
          }))}
          disabled={!canEdit}
        />
        <Select
          aria-label="项目默认语言"
          value={language}
          onChange={setLanguage}
          options={[
            { value: 'zh_fr', label: '中文 + 法语' },
            { value: 'zh_en', label: '中文 + 英文' },
          ]}
          disabled={!canEdit}
        />
        <Input
          aria-label="项目名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="项目名称"
          disabled={!canEdit}
        />
        <Select
          aria-label="项目国家"
          value={countryId || undefined}
          onChange={setCountryId}
          options={countries
            .filter((country) => country.is_active)
            .map((country) => ({ value: country.id, label: country.name }))}
          disabled={!canEdit}
          placeholder="选择国家"
        />
        <Input
          aria-label="项目默认站点"
          value={site}
          onChange={(event) => setSite(event.target.value)}
          placeholder="默认站点"
          disabled={!canEdit}
        />
        <Input
          aria-label="项目部门"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          placeholder="部门"
          disabled={!canEdit}
        />
        <Button
          disabled={!canEdit}
          onClick={() =>
            void save({
              kind: 'project',
              id: newId(),
              country_id: countryId,
              business_code: code,
              name,
              site,
              department_name: department,
              default_currency: currency,
              default_language_pair: language,
              is_active: true,
              version: 1,
            })
          }
        >
          新增项目
        </Button>
      </Space>
      <Table
        rowKey="id"
        pagination={false}
        dataSource={projects}
        columns={[
          { title: '代码', dataIndex: 'business_code' },
          {
            title: '名称',
            render: (_, row) => (
              <Input
                aria-label={`编辑项目名称-${row.business_code}`}
                defaultValue={row.name}
                disabled={!canEdit}
                onBlur={(event) => {
                  if (event.target.value !== row.name)
                    void save({
                      ...row,
                      name: event.target.value,
                      version: row.version + 1,
                    })
                }}
              />
            ),
          },
          {
            title: '国家',
            render: (_, row) => (
              <Select
                aria-label={`编辑项目国家-${row.business_code}`}
                value={row.country_id}
                disabled={!canEdit}
                options={countries.map((country) => ({
                  value: country.id,
                  label: country.name,
                }))}
                onChange={(country_id) =>
                  void save({ ...row, country_id, version: row.version + 1 })
                }
              />
            ),
          },
          {
            title: '币种',
            render: (_, row) => (
              <Select
                aria-label={`编辑项目币种-${row.business_code}`}
                value={row.default_currency}
                disabled={!canEdit}
                options={['XOF', 'CNY', 'USD', 'EUR'].map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(default_currency) =>
                  void save({
                    ...row,
                    default_currency,
                    version: row.version + 1,
                  })
                }
              />
            ),
          },
          {
            title: '语言',
            render: (_, row) => (
              <Select
                aria-label={`编辑项目语言-${row.business_code}`}
                value={row.default_language_pair}
                disabled={!canEdit}
                options={[
                  { value: 'zh_fr', label: '中文 + 法语' },
                  { value: 'zh_en', label: '中文 + 英文' },
                ]}
                onChange={(default_language_pair) =>
                  void save({
                    ...row,
                    default_language_pair,
                    version: row.version + 1,
                  })
                }
              />
            ),
          },
          { title: '状态', render: (_, row) => status(row) },
        ]}
      />
    </Space>
  )
}

function SiteEditor({
  projects,
  sites,
  canEdit,
  save,
  status,
}: {
  projects: Extract<ReferenceMasterDataView, { kind: 'project' }>[]
  sites: Extract<ReferenceMasterDataView, { kind: 'site' }>[]
  canEdit: boolean
  save: (item: ReferenceMasterDataView) => Promise<void>
  status: (item: ReferenceMasterDataView) => ReactNode
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Space wrap>
        <Input
          aria-label="站点代码"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="站点代码"
          disabled={!canEdit}
        />
        <Input
          aria-label="站点名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="站点名称"
          disabled={!canEdit}
        />
        <Select
          aria-label="站点项目"
          value={projectId || undefined}
          onChange={setProjectId}
          options={projects
            .filter((project) => project.is_active)
            .map((project) => ({ value: project.id, label: project.name }))}
          disabled={!canEdit}
          placeholder="选择项目"
        />
        <Button
          disabled={!canEdit}
          onClick={() =>
            void save({
              kind: 'site',
              id: newId(),
              project_id: projectId,
              business_code: code,
              name,
              is_active: true,
              version: 1,
            })
          }
        >
          新增站点
        </Button>
      </Space>
      <Table
        rowKey="id"
        pagination={false}
        dataSource={sites}
        columns={[
          {
            title: '站点',
            render: (_, row) => (
              <Input
                aria-label={`编辑站点名称-${row.business_code}`}
                defaultValue={row.name}
                disabled={!canEdit}
                onBlur={(event) => {
                  if (event.target.value !== row.name)
                    void save({
                      ...row,
                      name: event.target.value,
                      version: row.version + 1,
                    })
                }}
              />
            ),
          },
          {
            title: '项目',
            render: (_, row) => (
              <Select
                aria-label={`编辑站点项目-${row.business_code}`}
                value={row.project_id}
                disabled={!canEdit}
                options={projects.map((project) => ({
                  value: project.id,
                  label: project.name,
                }))}
                onChange={(project_id) =>
                  void save({ ...row, project_id, version: row.version + 1 })
                }
              />
            ),
          },
          { title: '状态', render: (_, row) => status(row) },
        ]}
      />
    </Space>
  )
}
