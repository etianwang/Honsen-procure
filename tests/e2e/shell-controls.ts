import type { Page } from '@playwright/test'

const destination = {
  home: ['home', ''],
  materials: ['catalog', ''],
  suppliers: ['catalog', ''],
  requisition: ['requisition', 'new'],
  execution: ['execution', ''],
  'master-data': ['master-data', 'countries'],
  authorization: ['system', 'create'],
  conflicts: ['system', ''],
} as const

export async function openShellPage(
  page: Page,
  route: keyof typeof destination,
) {
  const [group, entry] = destination[route]
  const link = page.locator(
    `[data-shell-route="${route}"]${entry ? `[data-shell-entry="${entry}"]` : ''}`,
  )
  if (route !== 'home' && !(await link.isVisible())) {
    await page.locator(`[data-shell-group="${group}"]`).click()
  }
  await link.click()
}

export async function openShellAccount(page: Page) {
  const trigger = page.locator('.honsen-shell-user')
  if ((await trigger.getAttribute('aria-expanded')) !== 'true')
    await trigger.click()
}

export async function selectShellLanguage(
  page: Page,
  locale: 'zh' | 'en' | 'fr',
) {
  const language = page.getByLabel('界面语言 / UI language / Langue')
  if (await page.locator('.honsen-shell-user').count())
    await openShellAccount(page)
  await language.selectOption(locale)
  if (await page.locator('.honsen-shell-user[aria-expanded="true"]').count())
    await language.press('Escape')
}
