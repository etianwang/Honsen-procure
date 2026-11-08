import { Alert, Button, Select, Spin } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CatalogApi,
  SupplierSearchCursor,
  SupplierView,
} from '../lib/catalog-api'
import { useUiLocale } from '../lib/ui-locale'

export type SupplierControlProps = {
  value?: string
  onChange: (id: string) => void
  disabled: boolean
  ariaLabel: string
}

type Props = {
  api: Pick<CatalogApi, 'searchSuppliersPage' | 'listSuppliers'>
  countryId: string
  ariaLabel?: string
  knownSupplier?: Pick<SupplierView, 'id' | 'businessCode' | 'name'>
  value?: string
  onChange?: (value: string) => void
  disabled?: boolean
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}

// Form.Item owns the supplier UUID. Only active, non-blacklisted suppliers are selectable.
export function SupplierPicker({
  api,
  countryId,
  ariaLabel,
  knownSupplier,
  value,
  onChange,
  disabled,
  ...accessible
}: Props) {
  const { locale } = useUiLocale()
  const text = {
    zh: {
      selected: '已选供应商',
      label: '供应商',
      search: '搜索供应商名称、编码或联系人',
      loading: '正在搜索供应商…',
      empty: '未找到可选供应商',
      error: '供应商查询失败，请重试',
      retry: '重试',
      more: '加载更多供应商',
    },
    en: {
      selected: 'Selected supplier',
      label: 'Supplier',
      search: 'Search supplier name, code or contact',
      loading: 'Searching suppliers…',
      empty: 'No selectable suppliers',
      error: 'Supplier search failed. Retry.',
      retry: 'Retry',
      more: 'Load more suppliers',
    },
    fr: {
      selected: 'Fournisseur sélectionné',
      label: 'Fournisseur',
      search: 'Rechercher un fournisseur, code ou contact',
      loading: 'Recherche de fournisseurs…',
      empty: 'Aucun fournisseur sélectionnable',
      error: 'Échec de la recherche. Réessayez.',
      retry: 'Réessayer',
      more: 'Charger plus de fournisseurs',
    },
  }[locale]
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [records, setRecords] = useState<SupplierView[]>([])
  const [cursor, setCursor] = useState<SupplierSearchCursor | null>(null)
  const [selected, setSelected] = useState<{
    countryId: string
    id: string
    label: string
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const epoch = useRef(0)
  const busy = useRef(false)
  const failedCursor = useRef<SupplierSearchCursor | null>(null)
  const search = useCallback(
    async (after: SupplierSearchCursor | null) => {
      if (api.searchSuppliersPage)
        return api.searchSuppliersPage(query.trim(), countryId, after, true)
      // Compatibility for injected preview adapters; native reads always use the paginated command.
      const rows = await api.listSuppliers()
      const terms = query
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean)
      return {
        records: rows.filter(
          (row) =>
            row.countryId === countryId &&
            row.isActive &&
            !row.isBlacklisted &&
            terms.every((term) =>
              [
                row.name,
                row.businessCode,
                row.contactName,
                row.address,
                row.city,
              ].some((field) => field?.toLocaleLowerCase().includes(term)),
            ),
        ),
        nextCursor: null,
      }
    },
    [api, query, countryId],
  )

  useEffect(() => {
    const generation = epoch
    const request = ++generation.current
    busy.current = false
    if (!open) return
    setRecords([])
    setCursor(null)
    setError(false)
    setLoading(true)
    const timer = window.setTimeout(() => {
      busy.current = true
      failedCursor.current = null
      void search(null)
        .then((page) => {
          if (request !== generation.current) return
          setRecords(page.records)
          setCursor(page.nextCursor)
        })
        .catch(() => {
          if (request === generation.current) setError(true)
        })
        .finally(() => {
          if (request === generation.current) {
            busy.current = false
            setLoading(false)
          }
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      generation.current++
    }
  }, [search, open, retry])

  async function more(after = cursor) {
    if (!after || busy.current) return
    const request = epoch.current
    busy.current = true
    failedCursor.current = after
    setLoading(true)
    setError(false)
    try {
      const page = await search(after)
      if (request !== epoch.current) return
      setRecords((current) => [
        ...current,
        ...page.records.filter(
          (row) => !current.some((old) => old.id === row.id),
        ),
      ])
      setCursor(page.nextCursor)
    } catch {
      if (request === epoch.current) setError(true)
    } finally {
      if (request === epoch.current) {
        busy.current = false
        setLoading(false)
      }
    }
  }

  return (
    <Select
      {...accessible}
      aria-label={ariaLabel ?? text.label}
      value={value}
      disabled={disabled}
      placeholder={text.search}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
      showSearch={{
        filterOption: false,
        searchValue: query,
        onSearch: setQuery,
        autoClearSearchValue: false,
      }}
      loading={loading}
      virtual
      listHeight={256}
      listItemHeight={48}
      labelRender={() => {
        if (!value) return undefined
        if (selected?.countryId === countryId && selected.id === value)
          return selected.label
        const known =
          knownSupplier?.id === value
            ? knownSupplier
            : records.find((row) => row.id === value)
        return known ? known.businessCode + ' · ' + known.name : text.selected
      }}
      options={records.map((row) => ({
        value: row.id,
        label: `${row.businessCode} · ${row.name}`,
        title: [row.contactName, row.city].filter(Boolean).join(' · '),
      }))}
      optionRender={(option) => (
        <div>
          <div>{option.label}</div>
          <small>{option.data.title}</small>
        </div>
      )}
      notFoundContent={
        loading ? (
          <span role="status">
            <Spin size="small" /> {text.loading}
          </span>
        ) : (
          <span role="status">{error ? text.error : text.empty}</span>
        )
      }
      onPopupScroll={(event) => {
        const el = event.currentTarget
        if (!error && el.scrollHeight - el.scrollTop - el.clientHeight < 48)
          void more()
      }}
      popupRender={(menu) => (
        <>
          {menu}
          <div onMouseDown={(event) => event.preventDefault()}>
            {error && (
              <Alert
                type="error"
                title={text.error}
                action={
                  <Button
                    size="small"
                    onClick={() =>
                      failedCursor.current
                        ? void more(failedCursor.current)
                        : setRetry((current) => current + 1)
                    }
                  >
                    {text.retry}
                  </Button>
                }
              />
            )}
            {cursor && !error && (
              <Button block loading={loading} onClick={() => void more()}>
                {text.more}
              </Button>
            )}
          </div>
        </>
      )}
      onChange={(id) => {
        const row = records.find((record) => record.id === id)
        if (!row) return
        setSelected({
          countryId,
          id,
          label: `${row.businessCode} · ${row.name}`,
        })
        onChange?.(id)
        setOpen(false)
        setQuery('')
      }}
    />
  )
}
