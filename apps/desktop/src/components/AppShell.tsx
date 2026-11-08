import { useUiLocale, shellText, type ShellMessage } from '../lib/ui-locale'
import type { PropsWithChildren } from 'react'
import {
  ClipboardPlus,
  LayoutDashboard,
  LibraryBig,
  Settings,
  Truck,
} from 'lucide-react'
import type { UserRole } from '../lib/permissions'
import type { SyncState } from '../lib/sync-lifecycle'
import defaultAvatar from '../assets/default-avatar.svg'
import { SyncStatusDetails } from './SyncStatusDetails'
import './AppShellToolbar.css'

export type AppPage =
  | 'home'
  | 'materials'
  | 'suppliers'
  | 'requisition'
  | 'execution'
  | 'conflicts'
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
  pageTitle: ShellMessage
  role: UserRole
  username?: string
  displayName?: string | null
  onNavigate: (page: AppPage) => void
  onLock?: () => void
  onChangePassword?: () => void
  passwordChangeAvailable?: boolean
  passwordChangeRecommended?: boolean
  syncState?: SyncState
  authorizationContexts?: AuthorizationContextOption[]
  selectedAuthorizationContext?: string
  onSelectAuthorizationContext?: (value: string) => void
}>

const roleLabel: Record<UserRole, ShellMessage> = {
  engineer: '工程师',
  purchaser: '采购员',
  administrator: '管理员',
  viewer: '查看者',
  super_administrator: '超级管理员',
}

export function AppShell({
  children,
  passwordChangeRecommended,
  page,
  pageTitle,
  role,
  username,
  displayName,
  onNavigate,
  onLock,
  onChangePassword,
  passwordChangeAvailable = false,
  syncState,
  authorizationContexts,
  selectedAuthorizationContext,
  onSelectAuthorizationContext,
}: AppShellProps) {
  const { locale, setLocale } = useUiLocale()
  const t = (message: ShellMessage) => shellText(locale, message)
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label={t('主导航')}>
        <div className="brand">
          <span className="brand-mark">H</span>
          <span>HONSEN</span>
        </div>
        <nav>
          <p className="nav-label">{t('采购工作台')}</p>
          <button
            className={`nav-button ${page === 'home' ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate('home')}
          >
            <LayoutDashboard size={17} aria-hidden="true" />
            {t('首页')}
          </button>
          <button
            className={`nav-button ${page === 'materials' ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate('materials')}
          >
            <LibraryBig size={17} aria-hidden="true" />
            {t('材料库')}
          </button>
          <button
            className={`nav-button ${page === 'suppliers' ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate('suppliers')}
          >
            <Truck size={17} aria-hidden="true" />
            {t('供应商与价格')}
          </button>
          <button
            className={`nav-button ${page === 'requisition' ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate('requisition')}
          >
            <ClipboardPlus size={17} aria-hidden="true" />
            {t('采购申请单')}
          </button>
          <button
            className={`nav-button ${page === 'execution' ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate('execution')}
          >
            <ClipboardPlus size={17} aria-hidden="true" />
            {t('采购执行')}
          </button>
          <button
            className={`nav-button ${page === 'master-data' ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate('master-data')}
          >
            <Settings size={17} aria-hidden="true" />
            {t('基础资料管理')}
          </button>
          {(role === 'administrator' || role === 'super_administrator') && (
            <button
              className={`nav-button ${page === 'conflicts' ? 'active' : ''}`}
              type="button"
              onClick={() => onNavigate('conflicts')}
            >
              <Settings size={17} aria-hidden="true" />
              {t('同步冲突')}
            </button>
          )}
          {(role === 'administrator' || role === 'super_administrator') && (
            <button
              className={`nav-button ${page === 'authorization' ? 'active' : ''}`}
              type="button"
              onClick={() => onNavigate('authorization')}
            >
              <Settings size={17} aria-hidden="true" />
              {t('在线授权管理')}
            </button>
          )}
        </nav>
      </aside>
      <main className="workspace">
        <header className="topbar honsen-shell-toolbar">
          <div>
            <p className="eyebrow">
              HONSEN Procure ·{' '}
              {locale === 'zh'
                ? '中文'
                : locale === 'en'
                  ? 'English'
                  : 'Français'}
            </p>
            <h1>{shellText(locale, pageTitle) ?? pageTitle}</h1>
          </div>
          <div className="honsen-shell-controls">
            <label className="honsen-shell-language">
              <span>
                {locale === 'zh'
                  ? '语言'
                  : locale === 'fr'
                    ? 'Langue'
                    : 'Language'}
              </span>
              <select
                aria-label="界面语言 / UI language / Langue"
                value={locale}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === 'zh' || value === 'en' || value === 'fr')
                    setLocale(value)
                }}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </label>
            {authorizationContexts && authorizationContexts.length > 0 && (
              <label className="honsen-shell-scope">
                <span>{t('当前授权范围')}</span>
                <select
                  aria-label={t('当前授权范围')}
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
            <SyncStatusDetails state={syncState} />
            <div className="honsen-shell-user">
              <span className="avatar" aria-hidden="true">
                <img src={defaultAvatar} width={32} height={32} alt="" />
              </span>
              {username && (
                <span className="signed-in-username">
                  {displayName || username}
                  {displayName && displayName !== username
                    ? ` (${username})`
                    : ''}
                </span>
              )}
              <span>{t(roleLabel[role])}</span>
              {onChangePassword && (
                <button
                  type="button"
                  disabled={!passwordChangeAvailable}
                  onClick={onChangePassword}
                >
                  {t('修改密码')}
                </button>
              )}
              {onChangePassword && !passwordChangeAvailable && (
                <span className="password-online-note">
                  {t('修改密码需要在线登录和可用连接。')}
                </span>
              )}
              {onLock && (
                <button type="button" onClick={onLock}>
                  {t('锁定')}
                </button>
              )}
            </div>
          </div>
        </header>
        <div className="content">
          {passwordChangeRecommended && (
            <div className="password-recommendation">
              <p role="status">
                {t('初始密码仍在使用，建议修改密码；可继续使用系统')}
              </p>
              {onChangePassword && (
                <button
                  type="button"
                  disabled={!passwordChangeAvailable}
                  onClick={onChangePassword}
                >
                  {t('修改密码')}
                </button>
              )}
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  )
}
