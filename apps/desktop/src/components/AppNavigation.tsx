import { Popover } from 'antd'
import {
  ChevronDown,
  ClipboardList,
  Database,
  LayoutDashboard,
  LibraryBig,
  PanelLeft,
  Shield,
  Truck,
} from 'lucide-react'
import { useRef, useState, useSyncExternalStore } from 'react'
import { shellText, useUiLocale, type ShellMessage } from '../lib/ui-locale'
import type { AppPage } from './AppShell'

export type ShellEntry =
  | 'new'
  | 'history'
  | 'review'
  | 'countries'
  | 'units'
  | 'tax-templates'
  | 'manage'
  | 'create'

type Destination = {
  page: AppPage
  label: ShellMessage
  entry?: ShellEntry
}

const groups: {
  id: string
  label: ShellMessage
  icon: typeof Truck
  items: Destination[]
}[] = [
  {
    id: 'requisition',
    label: '请购与审核',
    icon: ClipboardList,
    items: [
      { page: 'requisition', label: '新建请购', entry: 'new' },
      { page: 'requisition', label: '请购历史', entry: 'history' },
      { page: 'requisition', label: '待审核', entry: 'review' },
    ],
  },
  {
    id: 'execution',
    label: '采购执行',
    icon: Truck,
    items: [{ page: 'execution', label: '执行订单' }],
  },
  {
    id: 'catalog',
    label: '材料与供应',
    icon: LibraryBig,
    items: [
      { page: 'materials', label: '材料库' },
      { page: 'suppliers', label: '供应商与价格' },
    ],
  },
  {
    id: 'master-data',
    label: '基础资料管理',
    icon: Database,
    items: [
      { page: 'master-data', label: '组织资料', entry: 'countries' },
      { page: 'master-data', label: '采购字典', entry: 'units' },
      { page: 'master-data', label: '财务与打印', entry: 'tax-templates' },
    ],
  },
  {
    id: 'system',
    label: '授权与系统',
    icon: Shield,
    items: [
      { page: 'authorization', label: '管理已有账号', entry: 'manage' },
      { page: 'authorization', label: '创建账号', entry: 'create' },
      { page: 'conflicts', label: '同步冲突' },
    ],
  },
]

const railQuery = '(max-width: 900px)'
const isNarrow = () => window.matchMedia(railQuery).matches
function subscribeToWidth(listener: () => void) {
  const media = window.matchMedia(railQuery)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}

export function AppNavigation({
  page,
  entry,
  onNavigate,
  canCreate,
  canReview,
  canManageReference,
  canManageSystem,
  accountNavigationBusy,
}: {
  page: AppPage
  entry?: ShellEntry
  onNavigate: (page: AppPage, entry?: ShellEntry) => void
  canCreate: boolean
  canReview: boolean
  canManageReference: boolean
  canManageSystem: boolean
  accountNavigationBusy: boolean
}) {
  const { locale } = useUiLocale()
  const t = (label: ShellMessage) => shellText(locale, label)
  const narrow = useSyncExternalStore(subscribeToWidth, isNarrow)
  const [collapsed, setCollapsed] = useState(false)
  const [flyout, setFlyout] = useState<string | null>(null)
  const keyboardFlyout = useRef(false)
  const activeGroup = groups.find(({ items }) =>
    items.some((item) => item.page === page),
  )?.id
  const [accordion, setAccordion] = useState<{
    page: AppPage
    group?: string
  }>({ page, group: activeGroup })
  const expanded = accordion.page === page ? accordion.group : activeGroup
  const rail = narrow || collapsed

  function navigate(destination: Pick<Destination, 'page' | 'entry'>) {
    setFlyout(null)
    setAccordion({
      page: destination.page,
      group: groups.find(({ items }) =>
        items.some((item) => item.page === destination.page),
      )?.id,
    })
    onNavigate(destination.page, destination.entry)
  }

  function visible(item: Destination) {
    if (item.entry === 'new') return canCreate
    if (item.entry === 'review' || item.page === 'execution') return canReview
    if (item.page === 'master-data') return canManageReference
    if (item.page === 'authorization' || item.page === 'conflicts')
      return canManageSystem
    return true
  }

  return (
    <aside
      className="sidebar honsen-shell-sidebar"
      data-rail={rail}
      aria-label={t('主导航')}
    >
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          H
        </span>
        <span className="honsen-brand-name">HONSEN</span>
        <button
          type="button"
          className="honsen-sidebar-toggle"
          aria-label={t(rail ? '展开侧栏' : '折叠侧栏')}
          aria-expanded={!rail}
          title={t(rail ? '展开侧栏' : '折叠侧栏')}
          disabled={narrow}
          onClick={() => {
            setFlyout(null)
            setCollapsed(!collapsed)
          }}
        >
          <PanelLeft size={16} aria-hidden="true" />
        </button>
      </div>
      <nav aria-label={t('主导航')}>
        <button
          type="button"
          className="nav-button"
          data-shell-route="home"
          aria-current={page === 'home' ? 'page' : undefined}
          aria-label={t('首页')}
          title={rail ? t('首页') : undefined}
          onClick={() => navigate({ page: 'home' })}
        >
          <LayoutDashboard size={17} aria-hidden="true" />
          <span>{t('首页')}</span>
        </button>
        {groups.map(({ id, label, icon: Icon, items }) => {
          const available = items.filter(visible)
          if (!available.length) return null
          const active = activeGroup === id
          const open = rail ? flyout === id : expanded === id
          const activeEntry =
            entry ?? available.find((item) => item.page === page)?.entry
          const children = available.map((item) => (
            <button
              key={item.label}
              type="button"
              className="nav-button honsen-nav-leaf"
              data-shell-route={item.page}
              data-shell-entry={item.entry}
              disabled={item.page === 'authorization' && accountNavigationBusy}
              aria-current={
                page === item.page && activeEntry === item.entry
                  ? 'page'
                  : undefined
              }
              onClick={() => {
                if (rail) document.getElementById(`shell-group-${id}`)?.focus()
                navigate(item)
              }}
            >
              {t(item.label)}
            </button>
          ))
          const trigger = (
            <button
              id={`shell-group-${id}`}
              type="button"
              className="nav-button"
              data-shell-group={id}
              data-current={active}
              aria-label={rail ? t(label) : undefined}
              aria-expanded={open}
              title={rail ? t(label) : undefined}
              onClick={
                rail
                  ? (event) => {
                      keyboardFlyout.current = event.detail === 0
                    }
                  : () => setAccordion({ page, group: open ? undefined : id })
              }
              onKeyDown={(event) => {
                if (rail && event.key === 'Escape' && open) setFlyout(null)
                if (rail && event.key === 'ArrowDown') {
                  event.preventDefault()
                  if (open)
                    document
                      .getElementById(`shell-flyout-${id}`)
                      ?.querySelector<HTMLButtonElement>(
                        'button:not(:disabled)',
                      )
                      ?.focus()
                  else {
                    keyboardFlyout.current = true
                    setFlyout(id)
                  }
                }
              }}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{t(label)}</span>
              <ChevronDown
                size={14}
                className="honsen-nav-chevron"
                aria-hidden="true"
              />
            </button>
          )
          return rail ? (
            <Popover
              key={id}
              placement="rightTop"
              trigger={['hover', 'click']}
              open={open}
              onOpenChange={(next) =>
                setFlyout((current) =>
                  next ? id : current === id ? null : current,
                )
              }
              afterOpenChange={(next) => {
                if (next && keyboardFlyout.current) {
                  keyboardFlyout.current = false
                  document
                    .getElementById(`shell-flyout-${id}`)
                    ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
                    ?.focus()
                }
              }}
              destroyOnHidden
              content={
                <div
                  id={`shell-flyout-${id}`}
                  className="honsen-nav-flyout"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setFlyout(null)
                      document.getElementById(`shell-group-${id}`)?.focus()
                    }
                  }}
                >
                  <strong>{t(label)}</strong>
                  {children}
                </div>
              }
            >
              {trigger}
            </Popover>
          ) : (
            <div key={id} className="honsen-nav-group">
              {trigger}
              {open && <div className="honsen-nav-children">{children}</div>}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
