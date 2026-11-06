import { useUiLocale } from '../lib/ui-locale'
import type { AccountScope, AccountScopeOptions } from '../lib/account-scope'
import { emptyAccountScope } from '../lib/account-scope'

export function AuthorizationScopePicker({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: AccountScope
  onChange: (scope: AccountScope) => void
  options: AccountScopeOptions
  disabled?: boolean
}) {
  const { locale } = useUiLocale()
  const t = (zh: string, en: string, fr: string) =>
    locale === 'zh' ? zh : locale === 'fr' ? fr : en
  const { records, allowed } = options
  const projects = records.filter(
    (r) =>
      r.kind === 'project' &&
      r.is_active &&
      (allowed === null || allowed.some((a) => a.projectId === r.id)),
  )
  const countries = records.filter(
    (r) =>
      r.kind === 'country' &&
      r.is_active &&
      projects.some((p) => p.kind === 'project' && p.country_id === r.id),
  )
  const departments = records.filter(
    (r) =>
      r.kind === 'department' &&
      r.is_active &&
      (allowed === null ||
        allowed.some(
          (a) => a.projectId === value.projectId && a.departmentId === r.id,
        )),
  )
  const teams = records.filter(
    (r) =>
      r.kind === 'team' &&
      r.is_active &&
      r.department_id === value.departmentId &&
      (allowed === null ||
        allowed.some(
          (a) =>
            a.projectId === value.projectId &&
            a.departmentId === value.departmentId &&
            a.teamId === r.id,
        )),
  )
  const placeholder = t('请选择', 'Select', 'Sélectionner')
  return (
    <div className="scope-picker">
      <label>
        {t('国家', 'Country', 'Pays')}
        <select
          value={value.countryId}
          disabled={disabled || !countries.length}
          onChange={(e) =>
            onChange({ ...emptyAccountScope, countryId: e.target.value })
          }
        >
          <option value="">{placeholder}</option>
          {countries.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('项目', 'Project', 'Projet')}
        <select
          value={value.projectId}
          disabled={disabled || !value.countryId}
          onChange={(e) =>
            onChange({
              countryId: value.countryId,
              projectId: e.target.value,
              departmentId: '',
              teamId: '',
            })
          }
        >
          <option value="">{placeholder}</option>
          {projects
            .filter(
              (r) => r.kind === 'project' && r.country_id === value.countryId,
            )
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        {t('部门', 'Department', 'Service')}
        <select
          value={value.departmentId}
          disabled={disabled || !value.projectId}
          onChange={(e) =>
            onChange({ ...value, departmentId: e.target.value, teamId: '' })
          }
        >
          <option value="">{placeholder}</option>
          {departments.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('班组', 'Team', 'Équipe')}
        <select
          value={value.teamId}
          disabled={disabled || !value.departmentId}
          onChange={(e) => onChange({ ...value, teamId: e.target.value })}
        >
          <option value="">{placeholder}</option>
          {teams.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {(!countries.length ||
        !records.some((r) => r.kind === 'department' && r.is_active) ||
        !records.some((r) => r.kind === 'team' && r.is_active)) && (
        <p role="status">
          {t(
            '暂无可用授权范围。请在基础资料中维护国家、项目、部门和班组，或联系管理员授权后重新加载。',
            'No available scope. Maintain countries, projects, departments and teams in master data, or ask an administrator for access, then reload.',
            'Aucun périmètre disponible. Complétez les pays, projets, services et équipes, ou demandez les droits à un administrateur, puis rechargez.',
          )}
        </p>
      )}
    </div>
  )
}
