import type { PropsWithChildren } from 'react'
import {
  ClipboardPlus,
  LayoutDashboard,
  LibraryBig,
  Settings,
} from 'lucide-react'
import type { UserRole } from '../lib/permissions'
import type { SyncState } from '../lib/sync-lifecycle'

export type AppPage =
  | 'home'
  | 'materials'
  | 'requisition'
  | 'execution'
  | 'master-data'
  | 'authorization'

export type AuthorizationContextOption = {
  projectId: string
  projectName: string
  site: string
  departmentId: string
  departmentName: string
  teamId: string
  teamName: string
}

type AppShellProps = PropsWithChildren<{
  page: AppPage
  pageTitle: string
  role: UserRole
  onNavigate: (page: AppPage) => void
  onLock?: () => void
  syncState?: SyncState
  authorizationContexts?: AuthorizationContextOption[]
  selectedAuthorizationContext?: string
  onSelectAuthorizationContext?: (value: string) => void
}>

const roleLabel: Record<UserRole, string> = {
  engineer: '工程师',
  purchaser: '采购员',
  administrator: '管理员',
  viewer: '查看者',
  super_administrator: '超级管理员',
}

export function AppShell({
  children,
  page,
  pageTitle,
  role,
  onNavigate,
  onLock,
  syncState,
  authorizationContexts,
  selectedAuthorizationContext,
  onSelectAuthorizationContext,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <span className="brand-mark">H</span>
          <span>HONSEN</span>
        </div>
        <nav>
          <p className="nav-label">采购工作台</p>
          <button
            className={`nav-button ${page === 'home' ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate('home')}
          >
            <LayoutDashboard size={17} aria-hidden="true" />
            首页
          </button>
          <button
            className={`nav-button ${page === 'materials' ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate('materials')}
          >
            <LibraryBig size={17} aria-hidden="true" />
            材料库
          </button>
          <button
            className={`nav-button ${page === 'requisition' ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate('requisition')}
          >
            <ClipboardPlus size={17} aria-hidden="true" />
            采购申请单
          </button>
          <button
            className={`nav-button ${page === 'execution' ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate('execution')}
          >
            <ClipboardPlus size={17} aria-hidden="true" />
            采购执行
          </button>
          <button
            className={`nav-button ${page === 'master-data' ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate('master-data')}
          >
            <Settings size={17} aria-hidden="true" />
            基础资料管理
          </button>
          {(role === 'administrator' || role === 'super_administrator') && (
            <button
              className={`nav-button ${page === 'authorization' ? 'active' : ''}`}
              type="button"
              onClick={() => onNavigate('authorization')}
            >
              <Settings size={17} aria-hidden="true" />
              在线授权管理
            </button>
          )}
          <p className="nav-label">即将接入</p>
          <button className="nav-button" type="button" disabled>
            供应商与价格
          </button>
        </nav>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">HONSEN Procure · 中文</p>
            <h1>{pageTitle}</h1>
          </div>
          <div className="identity">
            {authorizationContexts && authorizationContexts.length > 0 && (
              <label>
                <span className="sr-only">当前授权范围</span>
                <select
                  aria-label="当前授权范围"
                  value={selectedAuthorizationContext}
                  onChange={(event) =>
                    onSelectAuthorizationContext?.(event.target.value)
                  }
                >
                  {authorizationContexts.map((context) => {
                    const value = [
                      context.projectId,
                      context.departmentId,
                      context.teamId,
                    ].join(':')
                    return (
                      <option key={value} value={value}>
                        {context.projectName} · {context.site} ·{' '}
                        {context.departmentName} · {context.teamName}
                      </option>
                    )
                  })}
                </select>
              </label>
            )}
            <span role="status" aria-label="同步状态">
              {syncState?.kind === 'syncing'
                ? '同步中'
                : syncState?.kind === 'synced'
                  ? '上次同步成功；新操作可能待同步'
                  : syncState?.kind === 'pending'
                    ? `待同步 ${syncState.pendingCount ?? '未知'}`
                    : syncState?.kind === 'retrying'
                      ? '连接失败，等待重试；本地数据待同步'
                      : syncState?.kind === 'auth-required'
                        ? '登录已失效，请重新在线登录'
                        : syncState?.kind === 'account-boundary'
                          ? '多账号拉取已暂停，需先完成账号隔离恢复'
                          : '离线本地数据'}
              {syncState?.kind !== 'pending' &&
              syncState?.pendingCount !== undefined
                ? ` · 待同步 ${syncState.pendingCount}`
                : ''}
              {syncState?.conflictCount
                ? ` · 未解决冲突 ${syncState.conflictCount}`
                : ''}
              {syncState?.quarantinedCount
                ? ` · 待归属旧事件 ${syncState.quarantinedCount}`
                : ''}
              {syncState?.lastSuccessAt != null
                ? ` · 上次拉取成功 ${new Date(syncState.lastSuccessAt * 1000).toLocaleString()}`
                : ''}
            </span>
            <span className="avatar">张</span>
            <span>{roleLabel[role]}</span>
            {onLock && (
              <button type="button" onClick={onLock}>
                锁定
              </button>
            )}
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  )
}
