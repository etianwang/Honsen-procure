import { expect, test } from '@playwright/test'

for (const [locale, country, tax, rate, taxError, rateError] of [
  [
    'zh',
    '国家代码',
    '税率（基点）',
    '汇率小数字符串',
    '请输入0至100000之间的整数基点',
    '请输入最多8位小数的非负汇率',
  ],
  [
    'en',
    'country code',
    'Tax rate (basis points)',
    'Decimal exchange rate',
    'Enter integer basis points from 0 to 100000',
    'Enter a non-negative rate with up to 8 decimal places',
  ],
  [
    'fr',
    'code : pays',
    'Taux fiscal (points de base)',
    'Taux de change décimal',
    'Saisissez un entier de 0 à 100000 points de base',
    'Saisissez un taux positif ou nul avec 8 décimales maximum',
  ],
]) {
  test(`reference fields retain visible labels and finance field errors in ${locale}`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.addInitScript(
      (locale) => localStorage.setItem('honsen.procure.ui-locale', locale),
      locale,
    )
    await page.goto('/?test=master-data')
    for (const label of [country, tax, rate])
      await expect(
        page.locator('label').filter({ hasText: label }).first(),
      ).toBeVisible()
    await page.getByLabel(tax, { exact: true }).fill('-1')
    await expect(page.getByText(taxError, { exact: true })).toBeVisible()
    await expect(page.getByLabel(tax, { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await page.getByLabel(tax, { exact: true }).fill('0')
    await expect(page.getByText(taxError, { exact: true })).not.toBeVisible()
    await page.getByLabel(rate, { exact: true }).fill('invalid')
    await expect(page.getByText(rateError, { exact: true })).toBeVisible()
    await expect(page.getByLabel(rate, { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(errors).toEqual([])
  })
}
