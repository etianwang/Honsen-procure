import { expect, test } from '@playwright/test'

for (const [
  locale,
  loadText,
  retryLabel,
  allowLabel,
  reasonLabel,
  saveLabel,
  savingText,
  failureText,
  successText,
] of [
  [
    'zh',
    '正在读取审批策略',
    '重新读取审批策略',
    '允许自审',
    '策略修改原因',
    '保存策略',
    '正在保存审批策略',
    '策略更新失败',
    '自审策略已更新',
  ],
  [
    'en',
    'Loading approval policy',
    'Reload approval policy',
    'Allow self-approval',
    'Policy change reason',
    'Save policy',
    'Saving approval policy',
    'Policy update failed',
    'Self-approval policy updated',
  ],
  [
    'fr',
    'Chargement de la politique',
    'Recharger la politique d’approbation',
    'Autoriser l’auto-approbation',
    'Motif de modification de la politique',
    'Enregistrer la politique',
    'Enregistrement de la politique',
    'Échec : seuls les super-administrateurs',
    'Politique mise à jour',
  ],
] as const) {
  test(`approval policy cannot write unread defaults and retains rejected edits in ${locale}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto('/')
    await page.evaluate(async (locale) => {
      const load = (path: string) => import(/* @vite-ignore */ path)
      const React = await load('/node_modules/.vite/deps/react.js')
      const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
      const { ApprovalPolicyPanel } = await load(
        '/src/components/ApprovalPolicyPanel.tsx',
      )
      const { setUiLocale } = await load('/src/lib/ui-locale.ts')
      setUiLocale(locale)
      const host = window as Window & {
        __policyWrites?: { allow: boolean; reason: string }[]
        __finishPolicyRead?: (fail: boolean) => void
        __finishPolicySave?: (fail: boolean) => void
      }
      host.__policyWrites = []
      const api = {
        getApprovalPolicy: () =>
          new Promise((resolve, reject) => {
            host.__finishPolicyRead = (fail) =>
              fail
                ? reject(new Error('Synthetic read failure'))
                : resolve({ allowSelfApproval: true })
          }),
        setApprovalPolicy: (allow: boolean, reason: string) => {
          host.__policyWrites?.push({ allow, reason })
          return new Promise<void>((resolve, reject) => {
            host.__finishPolicySave = (fail) =>
              fail ? reject(new Error('Synthetic save failure')) : resolve()
          })
        },
      }
      const createRoot = DOM.createRoot ?? DOM.default.createRoot
      const createElement = React.createElement ?? React.default.createElement
      const target = document.createElement('div')
      document.body.replaceChildren(target)
      createRoot(target).render(
        createElement(ApprovalPolicyPanel, { api, canManage: true }),
      )
    }, locale)
    const save = page.getByRole('button', { name: saveLabel, exact: true })
    const reason = page.getByLabel(reasonLabel, { exact: true })
    await expect(page.getByRole('status')).toContainText(loadText)
    await expect(save).toBeDisabled()
    await expect(reason).toBeDisabled()
    await expect(
      page.getByRole('checkbox', { name: allowLabel, exact: true }),
    ).toHaveCount(0)
    await save.dispatchEvent('click')
    expect(
      await page.evaluate(
        () => (window as Window & { __policyWrites: unknown[] }).__policyWrites,
      ),
    ).toEqual([])
    await page.evaluate(() =>
      (
        window as Window & { __finishPolicyRead: (fail: boolean) => void }
      ).__finishPolicyRead(true),
    )
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(save).toBeDisabled()
    await save.dispatchEvent('click')
    expect(
      await page.evaluate(
        () => (window as Window & { __policyWrites: unknown[] }).__policyWrites,
      ),
    ).toEqual([])
    await page.getByRole('button', { name: retryLabel, exact: true }).click()
    await expect(page.getByRole('status')).toContainText(loadText)
    await page.evaluate(() =>
      (
        window as Window & { __finishPolicyRead: (fail: boolean) => void }
      ).__finishPolicyRead(false),
    )
    const allow = page.getByRole('checkbox', { name: allowLabel, exact: true })
    await expect(allow).toBeChecked()
    await save.click()
    await expect(reason).toHaveAttribute('aria-invalid', 'true')
    await expect(reason).toHaveAttribute(
      'aria-describedby',
      'approval-policy-reason-error',
    )
    await expect(page.locator('#approval-policy-reason-error')).toBeVisible()
    expect(
      await page.evaluate(
        () => (window as Window & { __policyWrites: unknown[] }).__policyWrites,
      ),
    ).toEqual([])
    await allow.uncheck()
    await reason.fill('Synthetic governance reason')
    await save.click()
    await expect(save).toBeDisabled()
    await expect(reason).toBeDisabled()
    await expect(allow).toBeDisabled()
    await expect(page.getByRole('status')).toContainText(savingText)
    await save.dispatchEvent('click')
    expect(
      await page.evaluate(
        () => (window as Window & { __policyWrites: unknown[] }).__policyWrites,
      ),
    ).toEqual([{ allow: false, reason: 'Synthetic governance reason' }])
    await page.evaluate(() =>
      (
        window as Window & { __finishPolicySave: (fail: boolean) => void }
      ).__finishPolicySave(true),
    )
    await expect(page.getByRole('alert')).toContainText(failureText)
    await expect(reason).toHaveValue('Synthetic governance reason')
    await expect(allow).not.toBeChecked()
    await save.click()
    await page.evaluate(() =>
      (
        window as Window & { __finishPolicySave: (fail: boolean) => void }
      ).__finishPolicySave(false),
    )
    await expect(page.getByRole('status')).toContainText(successText)
    await expect(reason).toHaveValue('')
    expect(errors).toEqual([])
  })
}
