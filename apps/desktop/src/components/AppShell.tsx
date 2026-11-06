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
        <header className="topbar">
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
          <div className="identity">
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
            {authorizationContexts && authorizationContexts.length > 0 && (
              <label>
                <span className="sr-only">{t('当前授权范围')}</span>
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
            <span role="status" aria-label={t('同步状态')}>
              {syncState?.kind === 'syncing'
                ? t('同步中')
                : syncState?.kind === 'synced'
                  ? t('上次同步成功；新操作可能待同步')
                  : syncState?.kind === 'pending'
                    ? `${t('待同步')} ${syncState.pendingCount ?? t('未知')}`
                    : syncState?.kind === 'retrying'
                      ? t('连接失败，等待重试；本地数据待同步')
                      : syncState?.kind === 'upgrade-required'
                        ? t('服务版本已停用，请升级客户端；本地数据已保留')
                        : syncState?.kind === 'auth-required'
                          ? t('登录已失效，请重新在线登录')
                          : syncState?.kind === 'account-boundary'
                            ? t('多账号拉取已暂停，需先完成账号隔离恢复')
                            : t('离线本地数据')}
              {syncState?.kind !== 'pending' &&
              syncState?.pendingCount !== undefined
                ? ` · ${t('待同步')} ${syncState.pendingCount}`
                : ''}
              {syncState?.conflictCount
                ? ` · ${t('未解决冲突')} ${syncState.conflictCount}`
                : ''}
              {syncState?.quoteRejectedCount
                ? ` · ${syncState.quoteRejectedCount} ${t('项报价失效，请撤回采购单并重新选价')}`
                : ''}
              {syncState?.quarantinedCount
                ? ` · ${t('待归属旧事件')} ${syncState.quarantinedCount}`
                : ''}
              {syncState?.lastSuccessAt != null
                ? ` · ${t('上次拉取成功')} ${new Date(syncState.lastSuccessAt * 1000).toLocaleString(locale === 'zh' ? 'zh-CN' : locale === 'en' ? 'en-US' : 'fr-FR')}`
                : ''}
            </span>
            <span className="avatar" aria-hidden="true">
              <img src={defaultAvatar} width={32} height={32} alt="" />
            </span>
            {username && <span className="signed-in-username">{username}</span>}
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
