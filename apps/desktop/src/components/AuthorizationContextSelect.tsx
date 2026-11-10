import { Select } from 'antd'
import { MapPin } from 'lucide-react'
import { useId, useMemo } from 'react'
import { shellText, useUiLocale, type ShellMessage } from '../lib/ui-locale'
import type { AuthorizationContextOption } from './AppShell'
import { ShellPopover } from './ShellPopover'

const searchable = (value: string) =>
  value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase()

export function AuthorizationContextSelect({
  contexts,
  value,
  onChange,
  compact,
  notice,
  open,
  onOpenChange,
}: {
  contexts: AuthorizationContextOption[]
  value?: string
  onChange?: (value: string) => void
  compact: boolean
  notice?: ShellMessage
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { locale } = useUiLocale()
  const t = (key: ShellMessage) => shellText(locale, key)
  const descriptionId = useId()
  const label = t('当前授权范围')
  const options = useMemo(
    () =>
      contexts.map((context) => ({
        value: [context.projectId, context.departmentId, context.teamId].join(
          ':',
        ),
        label: [
          context.countryName?.trim(),
          context.projectName,
          context.site,
          context.departmentName,
          context.teamName,
        ]
          .filter(Boolean)
          .join(' · '),
        context,
      })),
    [contexts],
  )
  const selected = options.find((option) => option.value === value)
  const fields: [ShellMessage, string | null | undefined][] = selected
    ? [
        ['国家', selected.context.countryName],
        ['项目', selected.context.projectName],
        ['工地', selected.context.site],
        ['部门', selected.context.departmentName],
        ['班组', selected.context.teamName],
      ]
    : []
  const summary = selected
    ? compact
      ? `${t('范围')} · ${selected.context.projectName}`
      : `${selected.context.projectName} · ${selected.context.teamName}`
    : t('选择范围')

  if (!options.length) {
    return (
      <div className="honsen-shell-scope">
        <ShellPopover
          label={label}
          className="honsen-scope-unavailable"
          open={open}
          onOpenChange={onOpenChange}
          trigger={
            <>
              <MapPin size={15} aria-hidden="true" />
              <span>
                {t(
                  notice ===
                    '当前没有可用的项目业务授权。请联系授权管理员分配项目、部门和班组；修改密码不会授予这些权限。'
                    ? '无项目授权'
                    : '范围待确认',
                )}
              </span>
            </>
          }
        >
          <p>{t(notice ?? '正在加载授权范围…')}</p>
        </ShellPopover>
      </div>
    )
  }

  return (
    <div className="honsen-shell-scope" title={selected?.label}>
      <span id={descriptionId} className="honsen-shell-sr-only">
        {selected?.label}
      </span>
      <Select
        aria-label={label}
        aria-describedby={descriptionId}
        value={value}
        open={open}
        onOpenChange={onOpenChange}
        onChange={(next) => {
          onChange?.(next)
          onOpenChange(false)
        }}
        onInputKeyDown={(event) => {
          if (event.key === 'Escape') onOpenChange(false)
        }}
        options={options}
        prefix={<MapPin size={15} aria-hidden="true" />}
        labelRender={() =>
          selected && !compact ? (
            <span className="honsen-scope-summary">
              <span>{selected.context.projectName}</span>
              <span aria-hidden="true">·</span>
              <span>{selected.context.teamName}</span>
            </span>
          ) : (
            summary
          )
        }
        placeholder={summary}
        virtual
        listHeight={256}
        popupMatchSelectWidth={400}
        classNames={{ popup: { root: 'honsen-scope-popup' } }}
        popupRender={(menu) => (
          <>
            {fields.length > 0 && (
              <dl className="honsen-scope-fields">
                {fields.map(([key, text]) => (
                  <div key={key}>
                    <dt>{t(key)}</dt>
                    <dd>{text?.trim() || '—'}</dd>
                  </div>
                ))}
              </dl>
            )}
            {menu}
          </>
        )}
        showSearch={{
          filterOption: (query, option) =>
            searchable(query)
              .split(/\s+/)
              .filter(Boolean)
              .every((token) =>
                searchable(option?.label ?? '').includes(token),
              ),
        }}
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
