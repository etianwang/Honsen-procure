import { Alert, Button, Select, Spin } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CatalogApi,
  CatalogMaterialView,
  CatalogSearchCursor,
} from '../lib/catalog-api'
import { useUiLocale } from '../lib/ui-locale'

type Props = {
  api: Pick<CatalogApi, 'searchCatalog' | 'searchCatalogPage'>
  projectId: string
  ariaLabel?: string
  value?: string
  valueLabel?: string
  disabled?: boolean
  onChange: (material: CatalogMaterialView) => void
}

export function MaterialPicker({
  api,
  projectId,
  ariaLabel,
  value,
  valueLabel,
  disabled,
  onChange,
}: Props) {
  const { locale } = useUiLocale()
  const text = {
    zh: {
      label: '材料',
      placeholder: '搜索名称、编码、型号或规格',
      loading: '正在搜索材料…',
      empty: '未找到匹配材料',
      error: '材料查询失败，请重试',
      retry: '重试',
      more: '加载更多材料',
    },
    en: {
      label: 'Material',
      placeholder: 'Search name, SKU, model or specification',
      loading: 'Searching materials…',
      empty: 'No matching materials',
      error: 'Material search failed. Retry.',
      retry: 'Retry',
      more: 'Load more materials',
    },
    fr: {
      label: 'Matériau',
      placeholder: 'Rechercher nom, référence, modèle ou spécification',
      loading: 'Recherche de matériaux…',
      empty: 'Aucun matériau correspondant',
      error: 'Échec de la recherche. Réessayez.',
      retry: 'Réessayer',
      more: 'Charger plus de matériaux',
    },
  }[locale]
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [records, setRecords] = useState<CatalogMaterialView[]>([])
  const [cursor, setCursor] = useState<CatalogSearchCursor | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const epoch = useRef(0)
  const busy = useRef(false)
  const failedCursor = useRef<CatalogSearchCursor | null>(null)

  // Legacy injected preview adapters remain bounded; the native adapter always uses cursor queries.
  const search = useCallback(
    async (after: CatalogSearchCursor | null) => {
      return api.searchCatalogPage
        ? api.searchCatalogPage(query.trim(), projectId, after)
        : {
            records: await api.searchCatalog(query.trim(), projectId),
            nextCursor: null,
          }
    },
    [api, projectId, query],
  )

  useEffect(() => {
    const request = ++epoch.current
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
          if (request !== epoch.current) return
          setRecords(page.records)
          setCursor(page.nextCursor)
        })
        .catch(() => {
          if (request === epoch.current) setError(true)
        })
        .finally(() => {
          if (request === epoch.current) {
            busy.current = false
            setLoading(false)
          }
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      epoch.current++
    }
    // The query function deliberately captures this request's project and text.
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
          (item) => !current.some((existing) => existing.id === item.id),
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
      aria-label={ariaLabel ?? text.label}
      value={value}
      disabled={disabled}
      placeholder={text.placeholder}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
      showSearch={{
        filterOption: false,
        onSearch: setQuery,
        searchValue: query,
        autoClearSearchValue: false,
      }}
      labelRender={(option) => valueLabel || option.label}
      loading={loading}
      virtual
      listHeight={256}
      listItemHeight={48}
      options={records.map((material) => ({
        value: material.id,
        label: `${locale === 'fr' ? material.nameFr || material.nameZh : locale === 'en' ? material.nameEn || material.nameZh : material.nameZh} · ${material.model}`,
        title: `${material.sku ?? ''} · ${material.specification} · ${material.unit}`,
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
        ) : error ? (
          <span>{text.error}</span>
        ) : (
          <span role="status">{text.empty}</span>
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
        const material = records.find((item) => item.id === id)
        if (material) {
          onChange(material)
          setOpen(false)
          setQuery('')
        }
      }}
    />
  )
}
