import { useUiLocale, shellText, type ShellMessage } from '../lib/ui-locale'
import { useRef, useState, type PropsWithChildren } from 'react'
import type { UserRole } from '../lib/permissions'
import type { SyncState } from '../lib/sync-lifecycle'
import defaultAvatar from '../assets/default-avatar.svg'
import { AuthorizationContextSelect } from './AuthorizationContextSelect'
import { AppNavigation, type ShellEntry } from './AppNavigation'
import { ShellPopover } from './ShellPopover'
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
  countryName?: string | null
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
  entry?: ShellEntry
  role: UserRole
  roles?: string[]
  username?: string
  displayName?: string | null
  onNavigate: (page: AppPage, entry?: ShellEntry) => void
  onLock?: () => void
  onChangePassword?: () => void
  passwordChangeAvailable?: boolean
  passwordChangeRecommended?: boolean
  syncState?: SyncState
  authorizationContexts?: AuthorizationContextOption[]
  selectedAuthorizationContext?: string
  onSelectAuthorizationContext?: (value: string) => void
  scopeNotice?: ShellMessage
  canCreate: boolean
  canReview: boolean
  canManageReference: boolean
  canManageSystem: boolean
  accountNavigationBusy: boolean
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
  entry,
  role,
  roles,
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
  scopeNotice,
  canCreate,
  canReview,
  canManageReference,
  canManageSystem,
  accountNavigationBusy,
}: AppShellProps) {
  const { locale, setLocale } = useUiLocale()
  const t = (message: ShellMessage) => shellText(locale, message)
  const [overlay, setOverlay] = useState<'sync' | 'user' | 'scope' | null>(null)
  const content = useRef<HTMLDivElement>(null)
  const shownRoles = Object.keys(roleLabel).filter(
    (key): key is UserRole => roles?.includes(key) ?? key === role,
  )
  const title = t(pageTitle)
  const accountName = displayName || username

  function toggle(next: 'sync' | 'user' | 'scope', open: boolean) {
    setOverlay((current) => (open ? next : current === next ? null : current))
  }

  return (
    <div className="app-shell honsen-app-shell">
      <AppNavigation
        page={page}
        entry={entry}
        canCreate={canCreate}
        canReview={canReview}
        canManageReference={canManageReference}
        canManageSystem={canManageSystem}
        accountNavigationBusy={accountNavigationBusy}
        onNavigate={(destination, target) => {
          if (destination !== page || target === 'new')
            content.current?.scrollTo(0, 0)
          setOverlay(null)
          onNavigate(destination, target)
        }}
      />
      <main className="workspace">
        <header className="topbar honsen-shell-toolbar">
          <h1 title={title}>{title}</h1>
          <AuthorizationContextSelect
            contexts={authorizationContexts ?? []}
            value={selectedAuthorizationContext}
            onChange={onSelectAuthorizationContext}
            compact={
              page === 'master-data' ||
              page === 'authorization' ||
              page === 'conflicts'
            }
            notice={scopeNotice}
            open={overlay === 'scope'}
            onOpenChange={(open) => toggle('scope', open)}
          />
          <SyncStatusDetails
            state={syncState}
            open={overlay === 'sync'}
            onOpenChange={(open) => toggle('sync', open)}
          />
          <ShellPopover
            label={t('账号菜单')}
            className="honsen-shell-user"
            open={overlay === 'user'}
            onOpenChange={(open) => toggle('user', open)}
            trigger={<img src={defaultAvatar} width={26} height={26} alt="" />}
          >
            <div className="honsen-account-heading">
              <strong>{accountName || t('账号菜单')}</strong>
              {username && accountName !== username && <span>{username}</span>}
              <span>
                {shownRoles
                  .map((assigned) => t(roleLabel[assigned]))
                  .join(' · ')}
              </span>
            </div>
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
            {onChangePassword && (
              <button
                type="button"
                disabled={!passwordChangeAvailable}
                onClick={() => {
                  setOverlay(null)
                  onChangePassword()
                }}
              >
                {t('修改密码')}
              </button>
            )}
            {onChangePassword && !passwordChangeAvailable && (
              <p>{t('修改密码需要在线登录和可用连接。')}</p>
            )}
            {onLock && (
              <button
                type="button"
                onClick={() => {
                  setOverlay(null)
                  onLock()
                }}
              >
                {t('锁定')}
              </button>
            )}
          </ShellPopover>
        </header>
        <div className="content" ref={content}>
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
