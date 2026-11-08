import { useUiLocale } from '../lib/ui-locale'
import {
  governanceText,
  type GovernanceMessage,
} from '../lib/governance-messages'
import { Alert, Button, Card, Checkbox, Input } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkflowApi } from '../lib/workflow-api'

type ApprovalPolicyPanelProps = {
  api: WorkflowApi
  canManage: boolean
}

export function ApprovalPolicyPanel({
  api,
  canManage,
}: ApprovalPolicyPanelProps) {
  const { locale: activeLocale } = useUiLocale()
  const text = (key: GovernanceMessage) => governanceText(activeLocale, key)
  const [allowSelfApproval, setAllowSelfApproval] = useState<boolean | null>(
    null,
  )
  const [readState, setReadState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  )
  const [saving, setSaving] = useState(false)
  const readGeneration = useRef(0)
  const savePending = useRef(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<GovernanceMessage | null>(null)

  const readPolicy = useCallback(async () => {
    const generation = ++readGeneration.current
    setReadState('loading')
    setAllowSelfApproval(null)
    setMessage(null)
    try {
      const policy = await api.getApprovalPolicy()
      if (generation !== readGeneration.current) return
      setAllowSelfApproval(policy.allowSelfApproval)
      setReadState('ready')
    } catch {
      if (generation !== readGeneration.current) return
      setReadState('error')
      setMessage('无法读取审批策略。')
    }
  }, [api])
  useEffect(() => {
    void readPolicy()
    return () => {
      readGeneration.current += 1
    }
  }, [readPolicy])

  async function save() {
    if (
      !canManage ||
      readState !== 'ready' ||
      allowSelfApproval === null ||
      savePending.current
    )
      return
    if (!reason.trim()) {
      setMessage('策略修改原因必填。')
      return
    }
    const generation = readGeneration.current
    savePending.current = true
    setSaving(true)
    setMessage(null)
    try {
      await api.setApprovalPolicy(allowSelfApproval, reason.trim())
      if (generation !== readGeneration.current) return
      setMessage('自审策略已更新，并已写入永久审计。')
      setReason('')
    } catch {
      if (generation === readGeneration.current)
        setMessage('策略更新失败：仅超级管理员可修改。')
    } finally {
      savePending.current = false
      setSaving(false)
    }
  }
  const reasonError = message === '策略修改原因必填。'

  return (
    <Card className="card" title={text('全局审批策略')}>
      <p>{text('默认禁止采购员或管理员确认自己的订单。')}</p>
      {readState === 'loading' && (
        <p role="status" aria-live="polite">
          {text('正在读取审批策略…')}
        </p>
      )}
      {readState === 'error' && (
        <Button onClick={() => void readPolicy()} disabled={saving}>
          {text('重新读取审批策略')}
        </Button>
      )}
      {readState === 'ready' && allowSelfApproval !== null && (
        <Checkbox
          aria-label={text('允许自审')}
          checked={allowSelfApproval}
          disabled={!canManage || saving}
          onChange={(event) => setAllowSelfApproval(event.target.checked)}
        >
          {text('允许采购员/管理员自审')}
        </Checkbox>
      )}
      {!canManage && <p>{text('当前账号不可修改审批策略。')}</p>}
      {canManage ? (
        <div className="approval-policy-form">
          <label>
            {text('修改原因')}
            <Input
              aria-label={text('策略修改原因')}
              aria-required="true"
              aria-invalid={reasonError}
              aria-describedby={
                reasonError ? 'approval-policy-reason-error' : undefined
              }
              maxLength={1000}
              disabled={readState !== 'ready' || saving}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
                if (reasonError) setMessage(null)
              }}
            />
            {reasonError && (
              <span id="approval-policy-reason-error" role="alert">
                {text('策略修改原因必填。')}
              </span>
            )}
          </label>
          <Button
            type="primary"
            aria-label={text('保存策略')}
            aria-busy={saving}
            loading={saving}
            disabled={readState !== 'ready' || saving}
            onClick={() => void save()}
          >
            {text('保存策略')}
          </Button>
        </div>
      ) : null}
      {saving && (
        <p role="status" aria-live="polite">
          {text('正在保存审批策略…')}
        </p>
      )}
      {message && !reasonError ? (
        <Alert
          role={
            message === '自审策略已更新，并已写入永久审计。'
              ? 'status'
              : 'alert'
          }
          showIcon
          title={text(message)}
          type={
            message === '自审策略已更新，并已写入永久审计。'
              ? 'success'
              : 'error'
          }
        />
      ) : null}
    </Card>
  )
}
