import { Input, Table, type TableProps } from 'antd'
import { useState } from 'react'
import { useUiLocale } from '../lib/ui-locale'

/** Small, already-authorized reference dictionaries; large catalogs use SQLite cursors. */
export function ReferenceDataTable<
  T extends { id: string; name: string; business_code: string },
>({ dataSource = [], ...props }: TableProps<T>) {
  const { locale } = useUiLocale()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const label =
    locale === 'zh'
      ? '搜索编码或名称'
      : locale === 'fr'
        ? 'Rechercher par code ou nom'
        : 'Search code or name'
  const normalize = (value: string) =>
    value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase()
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean)
  const rows = dataSource.filter((row) =>
    tokens.every((token) =>
      normalize(`${row.business_code} ${row.name}`).includes(token),
    ),
  )
  return (
    <div>
      <label>
        {label}
        <Input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(1)
          }}
          allowClear
        />
      </label>
      <Table<T>
        {...props}
        size="small"
        dataSource={rows}
        pagination={
          rows.length > 25
            ? {
                current: Math.min(page, Math.ceil(rows.length / 25)),
                pageSize: 25,
                showSizeChanger: false,
                onChange: setPage,
              }
            : false
        }
      />
    </div>
  )
}
