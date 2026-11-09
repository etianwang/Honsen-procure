import { expect, test } from '@playwright/test'

for (const [locale, saved] of [
  ['zh', '已保存'],
  ['en', 'Saved'],
  ['fr', 'Enregistré'],
] as const) {
  test(`reference name validates UTF-8 and retains rejected edits in ${locale}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page
      .getByRole('button', { name: '打开界面预览', exact: true })
      .waitFor()
    await page.evaluate(async (locale) => {
      const load = (path: string) => import(/* @vite-ignore */ path)
      const React = await load('/node_modules/.vite/deps/react.js')
      const DOM = await load('/node_modules/.vite/deps/react-dom_client.js')
      const { ReferenceNameField } = await load(
        '/src/components/ReferenceNameField.tsx',
      )
      const { setUiLocale } = await load('/src/lib/ui-locale.ts')
      setUiLocale(locale)
      const createElement = React.createElement ?? React.default.createElement
      const createRoot = DOM.createRoot ?? DOM.default.createRoot
      const writes: string[] = []
      Object.assign(window, { __nameWrites: writes })
      const host = document.createElement('div')
      document.body.replaceChildren(host)
      const root = createRoot(host)
      let value = 'Original'
      function render() {
        root.render(
          createElement(ReferenceNameField, {
            id: 'synthetic-name',
            label: 'Synthetic name',
            ariaLabel: 'Synthetic name',
            value,
            disabled: false,
            onSave: async (name: string) => {
              writes.push(name)
              if (writes.length === 1) return false
              await new Promise<void>((resolve) =>
                Object.assign(window, { __finishNameSave: resolve }),
              )
              value = name
              render()
              return true
            },
          }),
        )
      }
      render()
    }, locale)
    const input = page.getByLabel('Synthetic name', { exact: true })
    await input.fill(' ')
    await input.press('Enter')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('alert')).toBeVisible()
    expect(
      await page.evaluate(
        () => (window as Window & { __nameWrites: string[] }).__nameWrites,
      ),
    ).toEqual([])
    await input.fill('界'.repeat(86))
    await input.press('Enter')
    await expect(page.getByRole('alert')).toContainText(
      /名称过长|Name is too long|Le nom est trop long/,
    )
    expect(
      await page.evaluate(
        () => (window as Window & { __nameWrites: string[] }).__nameWrites,
      ),
    ).toEqual([])
    const valid = '界'.repeat(85)
    await input.fill(valid)
    await input.dispatchEvent('compositionstart')
    await input.dispatchEvent('keydown', {
      key: 'Enter',
      isComposing: true,
      keyCode: 229,
    })
    expect(
      await page.evaluate(
        () => (window as Window & { __nameWrites: string[] }).__nameWrites,
      ),
    ).toEqual([])
    await expect(input).toBeEnabled()
    await input.dispatchEvent('compositionend')
    await input.press('Enter')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(input).toHaveValue(valid)
    await input.press('Enter')
    await expect(input).toBeDisabled()
    await expect(input).toHaveAttribute('aria-busy', 'true')
    await input.dispatchEvent('keydown', { key: 'Enter' })
    expect(
      await page.evaluate(
        () => (window as Window & { __nameWrites: string[] }).__nameWrites,
      ),
    ).toEqual([valid, valid])
    await page.evaluate(() =>
      (window as Window & { __finishNameSave: () => void }).__finishNameSave(),
    )
    await expect(input).toBeEnabled()
    await expect(input).toHaveValue(valid)
    await expect(page.getByRole('status')).toHaveText(saved)
    await expect(input).toBeFocused()
    await expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(errors).toEqual([])
  })
}
