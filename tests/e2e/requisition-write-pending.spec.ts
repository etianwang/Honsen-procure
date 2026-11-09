import { expect, test } from '@playwright/test'

for (const [locale, materialLabel, saveLabel, submitLabel] of [
  ['zh', '材料', '保存草稿', '提交确认'],
  ['en', 'Material', 'Save draft', 'Submit for confirmation'],
  ['fr', 'Matériau', 'Enregistrer le brouillon', 'Soumettre à confirmation'],
] as const)
  for (const action of ['save', 'submit'] as const) {
    for (const leave of ['stay', 'queued', 'saving'] as const) {
      test(`requisition ${action} waits for autosave and retains failed draft in ${locale}, leave=${leave}`, async ({
        page,
      }) => {
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.addInitScript(
          ({ locale, action, leave }) => {
            localStorage.setItem('honsen.procure.ui-locale', locale)
            const material = {
              id: '00000000-0000-4000-8000-000000000011',
              sku: 'SYNTH',
              nameZh: '合成材料',
              nameEn: 'Synthetic material',
              nameFr: 'Matériau synthétique',
              model: 'MODEL',
              specification: 'SYNTH-SPEC',
              unit: 'm',
              aliases: [],
              brand: null,
              notes: null,
              version: 1,
              prices: [
                {
                  priceId: '00000000-0000-4000-8000-000000000012',
                  supplierId: '00000000-0000-4000-8000-000000000013',
                  supplierName: 'Synthetic supplier',
                  isPreferredSupplier: false,
                  currency: 'XOF',
                  unitPriceMinor: '1234',
                  unit: 'm',
                  effectiveAt: '2026-11-09',
                },
              ],
            }
            const drafts: unknown[] = []
            const commands: string[] = []
            const result = {
              subtotalMinor: '1234',
              lineDiscountMinor: '0',
              orderDiscountMinor: '0',
              freightMinor: '0',
              taxMinor: '0',
              totalMinor: '1234',
            }
            Object.assign(window, {
              __pendingDrafts: drafts,
              __pendingCommands: commands,
              __TAURI__: {
                core: {
                  invoke: async (
                    command: string,
                    args?: { draft?: unknown },
                  ) => {
                    if (command === 'search_catalog_page')
                      return { records: [material], nextCursor: null }
                    if (command === 'search_catalog') return [material]
                    if (command === 'list_catalog_prices')
                      return material.prices
                    if (command === 'list_requisition_history')
                      return { records: [], nextCursor: null }
                    if (
                      command === 'list_order_comments' ||
                      command === 'list_order_audits'
                    )
                      return []
                    if (command === 'save_requisition_draft') {
                      drafts.push(args?.draft)
                      commands.push('save')
                      if (drafts.length === 1)
                        return new Promise((resolve) =>
                          Object.assign(window, {
                            __releaseInitialSave: () => resolve(result),
                          }),
                        )
                      if (drafts.length === 2)
                        throw Error('Synthetic rejected manual save')
                      if (action === 'save' || leave === 'saving')
                        return new Promise((resolve, reject) =>
                          Object.assign(window, {
                            __finishPendingManual: (fail: boolean) =>
                              fail
                                ? reject(Error('Synthetic failure'))
                                : resolve(result),
                          }),
                        )
                      return result
                    }
                    if (command === 'set_procurement_mode') {
                      commands.push('mode')
                      return
                    }
                    if (command === 'submit_requisition_draft') {
                      commands.push('submit')
                      return new Promise((resolve, reject) =>
                        Object.assign(window, {
                          __finishPendingManual: (fail: boolean) =>
                            fail
                              ? reject(Error('Synthetic failure'))
                              : resolve(undefined),
                        }),
                      )
                    }
                    return undefined
                  },
                },
              },
            })
          },
          { locale, action, leave },
        )
        await page.goto('/')
        await page
          .getByRole('button', {
            name: /打开界面预览|Open interface preview|Ouvrir l’aperçu/,
          })
          .click()
        await page
          .getByRole('button', {
            name: /^(采购申请单|Purchase requisitions|Demandes d’achat)$/,
          })
          .click()
        const picker = page.getByRole('combobox', {
          name: materialLabel,
          exact: true,
        })
        await picker.click()
        await expect(
          page.locator('.ant-select-item-option').first(),
        ).toBeVisible()
        await picker.press('ArrowDown')
        await picker.press('Enter')
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (window as Window & { __pendingDrafts: unknown[] })
                  .__pendingDrafts.length,
            ),
          )
          .toBe(1)
        const button = page.getByRole('button', {
          name: action === 'save' ? saveLabel : submitLabel,
          exact: true,
        })
        await button.click()
        await expect(button).toBeDisabled()
        await expect(picker).toBeDisabled()
        await button.dispatchEvent('click')
        if (leave === 'queued') {
          await page
            .getByRole('button', { name: /^(首页|Home|Accueil)$/ })
            .click()
          await page.evaluate(async () => {
            ;(
              window as Window & { __releaseInitialSave: () => void }
            ).__releaseInitialSave()
            await new Promise((resolve) => setTimeout(resolve, 0))
          })
          expect(
            await page.evaluate(
              () =>
                (window as Window & { __pendingCommands: string[] })
                  .__pendingCommands,
            ),
          ).toEqual(['save'])
          expect(errors).toEqual([])
          return
        }
        expect(
          await page.evaluate(
            () =>
              (window as Window & { __pendingCommands: string[] })
                .__pendingCommands,
          ),
        ).toEqual(['save'])
        await page.evaluate(() =>
          (
            window as Window & { __releaseInitialSave: () => void }
          ).__releaseInitialSave(),
        )
        await expect(page.getByRole('alert')).toContainText(
          /保存失败|提交失败|Save failed|Submission failed|Échec de sauvegarde|Soumission échouée/,
        )
        await expect(button).toBeEnabled()
        await button.click()
        await expect(button).toBeDisabled()
        await button.dispatchEvent('click')
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (window as Window & { __pendingDrafts: unknown[] })
                  .__pendingDrafts.length,
            ),
          )
          .toBe(3)
        if (leave === 'saving') {
          await page
            .getByRole('button', { name: /^(首页|Home|Accueil)$/ })
            .click()
          await page.evaluate(async () => {
            ;(
              window as Window & {
                __finishPendingManual: (fail: boolean) => void
              }
            ).__finishPendingManual(false)
            await new Promise((resolve) => setTimeout(resolve, 0))
          })
          expect(
            await page.evaluate(
              () =>
                (window as Window & { __pendingCommands: string[] })
                  .__pendingCommands,
            ),
          ).toEqual(['save', 'save', 'save'])
          expect(errors).toEqual([])
          return
        }
        const commands = await page.evaluate(
          () =>
            (window as Window & { __pendingCommands: string[] })
              .__pendingCommands,
        )
        expect(commands).toEqual(
          action === 'save'
            ? ['save', 'save', 'save']
            : ['save', 'save', 'save', 'mode', 'submit'],
        )
        const drafts = await page.evaluate(
          () =>
            (
              window as Window & {
                __pendingDrafts: Array<{ lines: unknown[] }>
              }
            ).__pendingDrafts,
        )
        expect(drafts[2]).toEqual(drafts[0])
        expect(drafts[2].lines[0]).toMatchObject({
          quantity: '1',
          unit: 'm',
          currency: 'XOF',
          unitPriceMinor: '1234',
          materialId: '00000000-0000-4000-8000-000000000011',
        })
        await page.evaluate(() =>
          (
            window as Window & {
              __finishPendingManual: (fail: boolean) => void
            }
          ).__finishPendingManual(false),
        )
        await expect(
          page.getByRole('status').filter({
            hasText:
              /草稿已自动保存|采购申请已提交|Draft saved|Requisition submitted|Brouillon enregistré|Demande soumise/,
          }),
        ).toBeVisible()
        expect(errors).toEqual([])
      })
    }
  }
