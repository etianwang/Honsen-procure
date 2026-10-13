import { useState } from 'react'

type Binding = {
  projectId: string
  departmentId: string
  teamId: string
  site: string
}

type Invoke = <T>(command: string, args?: object) => Promise<T>

function getInvoke(): Invoke | undefined {
  return (window as Window & { __TAURI__?: { core?: { invoke?: Invoke } } })
    .__TAURI__?.core?.invoke
}

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export function AuthorizationManagementPage() {
  const [accountId, setAccountId] = useState('')
  const [bindings, setBindings] = useState<Binding[]>([])
  const [projectId, setProjectId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [editing, setEditing] = useState<Binding | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    const invoke = getInvoke()
    if (!invoke || !isUuid(accountId)) {
      setMessage('请输入有效的账户 UUID，并连接云端。')
      return
    }
    setBusy(true)
    try {
      const result = await invoke<Binding[]>('list_managed_authorizations', {
        accountId,
      })
      setBindings(result)
      setMessage(`已读取 ${result.length} 个云端授权范围。`)
    } catch {
      setMessage('查询失败。请检查在线连接、登录状态与管理权限。')
    } finally {
      setBusy(false)
    }
  }

  const change = async (binding: Binding, revoke: boolean) => {
    const invoke = getInvoke()
    if (!invoke || !isUuid(accountId)) return
    setBusy(true)
    try {
      await invoke<void>('change_managed_authorization', {
        accountId,
        binding: {
          projectId: binding.projectId,
          departmentId: binding.departmentId,
          teamId: binding.teamId,
        },
        revoke,
      })
      const result = await invoke<Binding[]>('list_managed_authorizations', {
        accountId,
      })
      setBindings(result)
      setMessage(revoke ? '授权已撤销。' : '授权已分配或更新。')
    } catch {
      setMessage('云端操作失败；请重新查询确认最终状态。')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    const invoke = getInvoke()
    if (!invoke || !canSave) return
    if (!editing) {
      await change(newBinding, false)
      return
    }
    setBusy(true)
    try {
      await invoke<void>('replace_managed_authorization', {
        accountId,
        replacement: {
          oldScope: {
            projectId: editing.projectId,
            departmentId: editing.departmentId,
            teamId: editing.teamId,
          },
          newScope: { projectId, departmentId, teamId },
        },
      })
      setBindings(
        await invoke<Binding[]>('list_managed_authorizations', { accountId }),
      )
      setEditing(null)
      setMessage('授权范围已原子修改。')
    } catch {
      setMessage('修改失败；原授权保持不变。请重新查询云端状态。')
    } finally {
      setBusy(false)
    }
  }

  const newBinding = { projectId, departmentId, teamId, site: '' }
  const canSave =
    isUuid(accountId) &&
    isUuid(projectId) &&
    isUuid(departmentId) &&
    isUuid(teamId) &&
    !busy

  return (
    <section
      className="auth-management"
      aria-labelledby="auth-management-title"
    >
      <h2 id="auth-management-title">在线授权管理</h2>
      <p>仅管理员在线操作；离线缓存不能分配或撤销权限。</p>
      <div className="auth-management-form">
        <label htmlFor="managed-account-id">账户 UUID</label>
        <input
          id="managed-account-id"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value.trim())}
          autoComplete="off"
        />
        <button
          type="button"
          disabled={busy || !isUuid(accountId)}
          onClick={() => void load()}
        >
          查询云端授权
        </button>
      </div>
      <ul aria-label="已授权范围">
        {bindings.map((binding) => (
          <li
            key={`${binding.projectId}:${binding.departmentId}:${binding.teamId}`}
          >
            <span>
              {binding.site || binding.projectId} · {binding.departmentId} ·{' '}
              {binding.teamId}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(binding)
                setProjectId(binding.projectId)
                setDepartmentId(binding.departmentId)
                setTeamId(binding.teamId)
              }}
            >
              修改
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void change(binding, true)}
            >
              撤销
            </button>
          </li>
        ))}
      </ul>
      <fieldset className="auth-management-form">
        <legend>{editing ? '修改授权范围' : '分配授权范围'}</legend>
        <label htmlFor="managed-project-id">项目 UUID</label>
        <input
          id="managed-project-id"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value.trim())}
        />
        <label htmlFor="managed-department-id">部门 UUID</label>
        <input
          id="managed-department-id"
          value={departmentId}
          onChange={(event) => setDepartmentId(event.target.value.trim())}
        />
        <label htmlFor="managed-team-id">班组 UUID</label>
        <input
          id="managed-team-id"
          value={teamId}
          onChange={(event) => setTeamId(event.target.value.trim())}
        />
        <button type="button" disabled={!canSave} onClick={() => void save()}>
          {editing ? '保存修改' : '分配授权'}
        </button>
        {editing && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(null)}
          >
            取消修改
          </button>
        )}
      </fieldset>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  )
}
