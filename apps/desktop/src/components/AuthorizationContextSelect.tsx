import { Select } from 'antd'
import { useMemo } from 'react'
import { shellText, useUiLocale } from '../lib/ui-locale'
import type { AuthorizationContextOption } from './AppShell'

const searchable = (value: string) =>
  value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase()

export function AuthorizationContextSelect({
  contexts,
  value,
  onChange,
}: {
  contexts: AuthorizationContextOption[]
  value?: string
  onChange?: (value: string) => void
}) {
  const { locale } = useUiLocale()
  const label = shellText(locale, '当前授权范围')
  const options = useMemo(
    () =>
      contexts.map((context) => ({
        value: [context.projectId, context.departmentId, context.teamId].join(
          ':',
        ),
        label: [
          context.projectName,
          context.site,
          context.departmentName,
          context.teamName,
        ].join(' · '),
      })),
    [contexts],
  )
  return (
    <div className="honsen-shell-scope">
      <label htmlFor="active-authorization-context">{label}</label>
      <Select
        id="active-authorization-context"
        aria-label={label}
        value={value}
        onChange={onChange}
        options={options}
        virtual
        listHeight={256}
        showSearch={{
          filterOption: (query, option) =>
            searchable(query)
              .split(/\s+/)
              .filter(Boolean)
              .every((token) =>
                searchable(option?.label ?? '').includes(token),
              ),
        }}
        placeholder={
          locale === 'zh'
            ? '搜索项目、工地、部门或班组'
            : locale === 'fr'
              ? 'Rechercher projet, chantier, département ou équipe'
              : 'Search project, site, department or team'
        }
        notFoundContent={
          <span role="status">
            {locale === 'zh'
              ? '没有匹配的已授权范围'
              : locale === 'fr'
                ? 'Aucun périmètre autorisé correspondant'
                : 'No matching authorized scope'}
          </span>
        }
      />
    </div>
  )
}
