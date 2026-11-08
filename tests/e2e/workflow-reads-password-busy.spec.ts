import { expect, test, type Page } from '@playwright/test'
import { workflowText } from '../../apps/desktop/src/lib/workflow-messages'

async function mountWorkflow(page: Page, locale: string) {
  await page.goto('/')
  await page.evaluate(async (locale) => {
    const load = (path: string) => import(/* @vite-ignore */ path)
    const React = await load('/node_modules/.vite/deps/react.js')
    const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
    const { OrderWorkflowPanel } = await load(
      '/src/components/OrderWorkflowPanel.tsx',
    )
    const { setUiLocale } = await load('/src/lib/ui-locale.ts')
    setUiLocale(locale)
    Object.assign(window, {
      __readMode: 'initial',
      __commentReads: 0,
      __auditReads: 0,
    })
    const comment = (body: string) => ({
      id: body,
      orderId: 'source',
      authorId: 'synthetic',
      body,
      createdAt: 1,
      notificationCount: 0,
    })
    const audit = (reason: string) => ({
      id: reason,
      orderId: 'source',
      actorId: 'synthetic',
      action: 'confirmed_revised',
      reason,
      previousJson: '{}',
      nextJson: '{}',
      createdAt: 1,
    })
    const read = async (kind: string, id: string) => {
      const key = kind === 'comments' ? '__commentReads' : '__auditReads'
      Object.assign(window, { [key]: Reflect.get(window, key) + 1 })
      const mode = Reflect.get(window, '__readMode')
      if (mode === 'initial')
        return new Promise((_resolve, reject) =>
          Object.assign(window, {
            [kind === 'comments' ? '__rejectComments' : '__rejectAudits']: () =>
              reject(Error('synthetic failure')),
          }),
        )
      if (mode === 'fail') throw Error('synthetic failed refresh')
      if (mode === 'old')
        return new Promise((resolve) =>
          Object.assign(window, {
            [kind === 'comments'
              ? '__releaseOldComments'
              : '__releaseOldAudits']: () =>
              resolve(
                kind === 'comments'
                  ? [comment('OLD-COMMENT')]
                  : [audit('OLD-AUDIT')],
              ),
          }),
        )
      return kind === 'comments'
        ? [comment(id === 'new' ? 'NEW-COMMENT' : 'KEPT-COMMENT')]
        : [audit(id === 'new' ? 'NEW-AUDIT' : 'KEPT-AUDIT')]
    }
    const api = {
      addOrderComment: async (_id: string, body: string) => comment(body),
      listOrderComments: (id: string) => read('comments', id),
      listOrderAudits: (id: string) => read('audits', id),
    }
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    const root = (DOM.createRoot ?? DOM.default.createRoot)(host)
    const render = (orderId = 'source') =>
      root.render(
        (React.createElement ?? React.default.createElement)(
          OrderWorkflowPanel,
          { api: { ...api }, orderId, canApprove: false },
        ),
      )
    Object.assign(window, {
      __renderReadWorkflow: render,
      __unmountReadWorkflow: () => root.unmount(),
    })
    render()
  }, locale)
}
async function invoke(page: Page, key: string, arg?: string) {
  await page.evaluate(
    ({ key, arg }) => {
      const fn = Reflect.get(window, key)
      if (typeof fn === 'function') fn(arg)
    },
    { key, arg },
  )
}
for (const locale of ['zh', 'en', 'fr'] as const) {
  test(`workflow partial reads retry independently, retain prior content and ignore old scope in ${locale}`, async ({
    page,
  }) => {
    const t = (key: Parameters<typeof workflowText>[1]) =>
      workflowText(locale, key)
    await mountWorkflow(page, locale)
    const comments = page.getByRole('region', {
      name: t('内部评论'),
      exact: true,
    })
    const audits = page.getByRole('region', {
      name: t('修改留痕'),
      exact: true,
    })
    await expect(
      comments.getByText(t('正在读取评论…'), { exact: true }),
    ).toBeVisible()
    await expect(
      audits.getByText(t('正在读取审计…'), { exact: true }),
    ).toBeVisible()
    await invoke(page, '__rejectComments')
    await invoke(page, '__rejectAudits')
    await expect(comments.getByRole('alert')).toContainText(
      t('评论读取失败；已加载内容已保留。'),
    )
    await expect(audits.getByRole('alert')).toContainText(
      t('审计读取失败；已加载内容已保留。'),
    )
    await expect(comments.getByText(t('暂无内部评论'))).not.toBeVisible()
    await page.evaluate(() => Object.assign(window, { __readMode: 'normal' }))
    await comments
      .getByRole('button', { name: t('重新读取评论'), exact: true })
      .click()
    await expect(
      comments.getByText('KEPT-COMMENT', { exact: true }),
    ).toBeVisible()
    expect(await page.evaluate(() => Reflect.get(window, '__auditReads'))).toBe(
      1,
    )
    await audits
      .getByRole('button', { name: t('重新读取审计'), exact: true })
      .click()
    await expect(audits.getByText(/KEPT-AUDIT/)).toBeVisible()
    await page.evaluate(() => Object.assign(window, { __readMode: 'fail' }))
    await invoke(page, '__renderReadWorkflow')
    await expect(comments.getByRole('alert')).toBeVisible()
    await expect(
      comments.getByText('KEPT-COMMENT', { exact: true }),
    ).toBeVisible()
    await expect(audits.getByText(/KEPT-AUDIT/)).toBeVisible()
    await page.evaluate(() => Object.assign(window, { __readMode: 'old' }))
    await invoke(page, '__renderReadWorkflow')
    await expect(comments.getByText(t('正在读取评论…'))).toBeVisible()
    await page.evaluate(() => Object.assign(window, { __readMode: 'normal' }))
    await invoke(page, '__renderReadWorkflow', 'new')
    await expect(
      comments.getByText('NEW-COMMENT', { exact: true }),
    ).toBeVisible()
    await expect(audits.getByText(/NEW-AUDIT/)).toBeVisible()
    await invoke(page, '__releaseOldComments')
    await invoke(page, '__releaseOldAudits')
    await expect(page.getByText(/OLD-COMMENT|OLD-AUDIT/)).toHaveCount(0)
    await page.evaluate(() => Object.assign(window, { __readMode: 'old' }))
    await invoke(page, '__renderReadWorkflow', 'old-order')
    await invoke(page, '__unmountReadWorkflow')
    await invoke(page, '__releaseOldComments')
    await invoke(page, '__releaseOldAudits')
    await expect(page.getByText(/OLD-COMMENT|OLD-AUDIT/)).toHaveCount(0)
  })
  test(`password busy feedback preserves clear-password security in ${locale}`, async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate(async (locale) => {
      const load = (path: string) => import(/* @vite-ignore */ path)
      const React = await load('/node_modules/.vite/deps/react.js')
      const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
      const { setUiLocale } = await load('/src/lib/ui-locale.ts')
      setUiLocale(locale)
      const { AccountPasswordDialog } = await load(
        '/src/components/AccountPasswordDialog.tsx',
      )
      Object.assign(window, {
        __TAURI__: {
          core: {
            invoke: async (command: string) => {
              await new Promise<void>((resolve) =>
                Object.assign(window, { __finishPassword: resolve }),
              )
              if (command === 'change_account_password')
                throw { code: 'sync_transport_error' }
            },
          },
        },
      })
      const host = document.createElement('div')
      document.body.replaceChildren(host)
      ;(DOM.createRoot ?? DOM.default.createRoot)(host).render(
        (React.createElement ?? React.default.createElement)(
          AccountPasswordDialog,
          {
            open: true,
            onClose: () => {},
            onChanged: () => Object.assign(window, { __passwordDone: true }),
          },
        ),
      )
    }, locale)
    const labels =
      locale === 'zh'
        ? [
            '当前密码',
            '新密码（至少12位）',
            '确认新密码',
            '修改并重新登录',
            '正在修改密码…',
            '正在修改密码，请稍候…',
            '返回登录',
            '正在返回登录…',
            '正在返回登录，请稍候…',
          ]
        : locale === 'en'
          ? [
              'Current password',
              'New password (at least 12 characters)',
              'Confirm new password',
              'Change and sign in again',
              'Changing password…',
              'Changing password, please wait…',
              'Return to sign-in',
              'Returning to sign-in…',
              'Returning to sign-in, please wait…',
            ]
          : [
              'Mot de passe actuel',
              'Nouveau mot de passe (12 caractères minimum)',
              'Confirmer le nouveau mot de passe',
              'Modifier et se reconnecter',
              'Modification en cours…',
              'Modification du mot de passe en cours…',
              'Retour à la connexion',
              'Retour à la connexion…',
              'Retour à la connexion en cours…',
            ]
    const dialog = page.getByRole('dialog')
    await dialog
      .getByLabel(labels[0], { exact: true })
      .fill('synthetic-current')
    await dialog
      .getByLabel(labels[1], { exact: true })
      .fill('synthetic-replacement')
    await dialog
      .getByLabel(labels[2], { exact: true })
      .fill('synthetic-replacement')
    await dialog.getByRole('button', { name: labels[3], exact: true }).click()
    await expect(
      dialog.getByRole('button', { name: labels[4], exact: true }),
    ).toHaveAttribute('aria-busy', 'true')
    await expect(
      dialog.getByRole('status').filter({ hasText: labels[5] }),
    ).toBeVisible()
    for (const input of await dialog.locator('input').all())
      await expect(input).toBeDisabled()
    await invoke(page, '__finishPassword')
    await expect(dialog.getByRole('alert')).toBeVisible()
    for (const input of await dialog.locator('input').all())
      await expect(input).toHaveValue('')
    await dialog.getByRole('button', { name: labels[6], exact: true }).click()
    await expect(
      dialog.getByRole('button', { name: labels[7], exact: true }),
    ).toHaveAttribute('aria-busy', 'true')
    await expect(
      dialog.getByRole('status').filter({ hasText: labels[8] }),
    ).toBeVisible()
    await expect(dialog.getByRole('alert')).not.toBeVisible()
    await invoke(page, '__finishPassword')
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, '__passwordDone')))
      .toBe(true)
  })
}

test('a successful comment remains visible when an earlier same-order list completes', async ({
  page,
}) => {
  await mountWorkflow(page, 'zh')
  await invoke(page, '__rejectComments')
  await invoke(page, '__rejectAudits')
  await page.evaluate(() => Object.assign(window, { __readMode: 'old' }))
  await invoke(page, '__renderReadWorkflow')
  await expect(page.getByText('正在读取评论…', { exact: true })).toBeVisible()
  await page
    .getByLabel('留言（支持 @某人）', { exact: true })
    .fill('LOCAL-COMMENT')
  await page.getByRole('button', { name: '发送评论', exact: true }).click()
  await expect(page.getByText('LOCAL-COMMENT', { exact: true })).toBeVisible()
  await invoke(page, '__releaseOldComments')
  await invoke(page, '__releaseOldAudits')
  await expect(page.getByText('OLD-COMMENT', { exact: true })).toBeVisible()
  await expect(page.getByText('LOCAL-COMMENT', { exact: true })).toBeVisible()
})
