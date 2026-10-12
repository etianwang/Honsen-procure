import type { PropsWithChildren } from 'react'
import {
  ClipboardPlus,
  LayoutDashboard,
  LibraryBig,
  Settings,
} from 'lucide-react'
import type { UserRole } from '../lib/permissions'

export type AppPage =
  'home' | 'materials' | 'requisition' | 'execution' | 'master-data'

type AppShellProps = PropsWithChildren<{
  page: AppPage
  pageTitle: string
  role: UserRole
  onNavigate: (page: AppPage) => void
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
            项目默认设置
          </button>
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
            <span>离线演示数据</span>
            <span className="avatar">张</span>
            <span>{roleLabel[role]}</span>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  )
}
