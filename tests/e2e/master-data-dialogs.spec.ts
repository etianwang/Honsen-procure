import { expect, test } from '@playwright/test'

test('dictionary dialogs label inputs, retain cancelled draft and expose saved row', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/?test=master-data')
  for (const [tab, title, codeLabel, nameLabel] of [
    ['单位', '新增单位', '单位代码', '单位名称'],
    ['部门', '新增部门', '部门代码', '部门名称'],
    ['材料分类', '新增材料分类', '材料分类代码', '材料分类名称'],
  ]) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await expect(page.getByLabel(codeLabel, { exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: title, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: title })
    await expect(
      dialog.getByRole('button', { name: title, exact: true }),
    ).toBeDisabled()
    await expect(dialog.locator('label', { hasText: codeLabel })).toBeVisible()
    await dialog
      .getByLabel(codeLabel, { exact: true })
      .fill(`TEST-${codeLabel.length}`)
    await dialog.getByLabel(nameLabel, { exact: true }).fill(`Fixture ${tab}`)
    await expect(
      dialog.getByRole('button', { name: title, exact: true }),
    ).toHaveCSS('background-color', 'rgb(36, 117, 94)')
    await expect(
      dialog.getByRole('button', { name: title, exact: true }),
    ).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(
      dialog.getByRole('button', { name: /取\s*消/, exact: true }),
    ).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await dialog.getByRole('button', { name: /取\s*消/, exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await page.getByRole('button', { name: title, exact: true }).click()
    await expect(dialog.getByLabel(codeLabel, { exact: true })).toHaveValue(
      `TEST-${codeLabel.length}`,
    )
    await dialog.getByRole('button', { name: title, exact: true }).click()
    await expect(dialog).not.toBeVisible()
    const row = page.getByRole('row').filter({
      has: page.getByRole('cell', {
        name: `TEST-${codeLabel.length}`,
        exact: true,
      }),
    })
    await expect(row.locator('label')).toHaveText(`${nameLabel} *`)
    await expect(row.getByRole('textbox')).toHaveAttribute(
      'aria-required',
      'true',
    )
    await expect(row.locator('label')).not.toContainText(
      `TEST-${codeLabel.length}`,
    )
    await expect(
      page.getByRole('cell', { name: `TEST-${codeLabel.length}`, exact: true }),
    ).toBeVisible()
  }
  expect(errors).toEqual([])
})
for (const [locale, tab, title, codeLabel, nameLabel] of [
  ['en', 'Unit', 'Add unit', 'unit code', 'unit name'],
  ['fr', 'Unité', 'Ajouter : unité', 'code : unité', 'nom : unité'],
]) {
  test(`dictionary dialog labels and required state in ${locale}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (locale) => localStorage.setItem('honsen.procure.ui-locale', locale),
      locale,
    )
    await page.goto('/?test=master-data')
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await page.getByRole('button', { name: title, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: title })
    await expect(dialog.getByLabel(codeLabel, { exact: true })).toHaveAttribute(
      'aria-required',
      'true',
    )
    await expect(dialog.getByLabel(nameLabel, { exact: true })).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: title, exact: true }),
    ).toBeDisabled()
  })
}

test('duplicate dictionary codes use exact case and trimmed comparison with field feedback', async ({
  page,
}) => {
  await page.goto('/?test=master-data')
  for (const [tab, title, codeLabel, nameLabel] of [
    ['单位', '新增单位', '单位代码', '单位名称'],
    ['部门', '新增部门', '部门代码', '部门名称'],
    ['材料分类', '新增材料分类', '材料分类代码', '材料分类名称'],
    ['团队', '新增团队', '团队代码', '团队名称'],
  ]) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await page.getByRole('button', { name: title, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: title })
    await dialog.getByLabel(codeLabel, { exact: true }).fill('TEST-Duplicate')
    await dialog.getByLabel(nameLabel, { exact: true }).fill('Fixture record')
    if (tab === '团队') {
      await dialog.getByLabel('团队所属部门').click()
      await page
        .locator('.ant-select-item-option')
        .filter({ hasText: 'Fixture record' })
        .click()
    }
    await dialog.getByRole('button', { name: title, exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await page.getByRole('button', { name: title, exact: true }).click()
    const code = dialog.getByLabel(codeLabel, { exact: true })
    await code.fill(' TEST-Duplicate ')
    await dialog.getByLabel(nameLabel, { exact: true }).fill('Retained name')
    await expect(code).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByRole('alert')).toHaveText(
      '此编码已存在，请使用其他编码',
    )
    await expect(
      dialog.getByRole('button', { name: title, exact: true }),
    ).toBeDisabled()
    await expect(dialog.getByLabel(nameLabel, { exact: true })).toHaveValue(
      'Retained name',
    )
    await code.fill('TEST-duplicate')
    await expect(code).toHaveAttribute('aria-invalid', 'false')
    await expect(
      dialog.getByRole('button', { name: title, exact: true }),
    ).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  }
})
