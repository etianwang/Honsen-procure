import { expect, test } from '@playwright/test'

test('development sign-in placeholder opens the workbench and navigates accessibly', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: '登录 HONSEN Procure' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '打开界面预览' }).click()

  await expect(page.getByRole('heading', { name: '今日概览' })).toBeVisible()
  await page.getByRole('button', { name: '材料库', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '材料库总览' }).last(),
  ).toBeVisible()
  await page.getByRole('button', { name: '首页', exact: true }).click()
  await expect(page.getByRole('heading', { name: '今日概览' })).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('owner purchase draft explicitly selects a quote source and saves trusted pricing', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              input?: Record<string, unknown>
              after?: string | null
              projectId?: string
            },
          ) {
            if (command === 'list_catalog_prices') {
              Object.assign(window, { __quoteProject: args?.projectId })
              return Promise.resolve(
                Array.from({ length: 26 }, (_, index) => ({
                  priceId: `quote-${index}`,
                  supplierId: `supplier-${index}`,
                  supplierName: `supplier ${index}`,
                  isPreferredSupplier: false,
                  currency: 'XOF',
                  unitPriceMinor: '1250',
                  unit: '件',
                  effectiveAt: '2026-10-12',
                })).slice(
                  args?.after ? Number(args.after.split('-').at(-1)) + 1 : 0,
                  args?.after ? Number(args.after.split('-').at(-1)) + 26 : 25,
                ),
              )
            }
            if (command === 'search_catalog')
              return Promise.resolve([
                {
                  id: '00000000-0000-4000-8000-000000000901',
                  sku: 'OWNER-FIXTURE',
                  nameZh: '业主报价材料',
                  nameFr: null,
                  aliases: [],
                  brand: null,
                  model: 'OP-01',
                  specification: 'fixture',
                  unit: '件',
                  notes: null,
                  version: 1,
                  prices: [
                    {
                      priceId: '00000000-0000-4000-8000-000000000902',
                      supplierId: '00000000-0000-4000-8000-000000000903',
                      supplierName: 'owner fixture supplier',
                      isPreferredSupplier: false,
                      currency: 'XOF',
                      unitPriceMinor: '1250',
                      unit: '件',
                      effectiveAt: '2026-10-12',
                    },
                  ],
                },
              ])
            if (command === 'save_requisition_draft') {
              return Promise.resolve({ totalMinor: '0' })
            }
            if (command === 'set_procurement_mode') {
              Object.assign(window, { __procurementMode: args?.mode })
              return Promise.resolve()
            }
            if (command === 'save_owner_purchase_pricing') {
              Object.assign(window, { __ownerPricingInput: args?.input })
              return Promise.resolve([
                {
                  orderItemId: (
                    args?.input?.lines as Array<{ orderItemId: string }>
                  )[0].orderItemId,
                  convertedReferenceUnitMinor: '1250',
                  markupMinor: '125',
                  finalUnitPriceMinor: '1375',
                },
              ])
            }
            return Promise.reject(new Error(`unexpected command: ${command}`))
          },
        },
      },
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await page.getByRole('button', { name: '采购申请单' }).click()
  await page.getByLabel('采购模式').click()
  await page.getByText('业主自行采购', { exact: true }).click()
  await page.getByLabel('材料').click()
  await page.getByText('业主报价材料 · OP-01', { exact: true }).click()
  await page.getByRole('button', { name: '加载更多报价' }).click()
  await expect(page.getByLabel('选择报价')).toHaveValue('')
  await page.getByLabel('选择报价').click()
  await page.getByText(/supplier 25 ·/).click()
  await page.getByRole('textbox', { name: '加价' }).fill('1000')
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByLabel('换算参考单价（只读）')).toHaveValue('1250')
  await expect(page.getByLabel('最终单价（只读）')).toHaveValue('1375')
  await expect(
    page.evaluate(
      () =>
        (
          window as Window & {
            __ownerPricingInput?: {
              lines?: Array<{ quoteSource?: { materialPriceId?: string } }>
            }
          }
        ).__ownerPricingInput?.lines?.[0]?.quoteSource?.materialPriceId,
    ),
  ).resolves.toBe('quote-25')
  await expect(browserErrors).toEqual([])
})

test('regular requisition page completes owner pricing rejection and resubmission', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    let pricingAttempt = 0
    let rejected = false
    const orderId = '00000000-0000-4000-8000-000000000911'
    const engineerId = '00000000-0000-4000-8000-000000000912'
    const purchaserId = '00000000-0000-4000-8000-000000000913'
    const pricingAudit = (
      reason: string | null,
      final: string,
      markup: string,
    ) => ({
      id: crypto.randomUUID(),
      orderId,
      actorId: engineerId,
      action: 'owner_pricing_saved',
      reason,
      previousJson: null,
      nextJson: JSON.stringify({
        lines: [
          {
            id: 'line-1',
            material: { nameZh: '跨币种业主材料' },
            supplier: { name: '审批报价供应商' },
            currency: 'CNY',
            ownerQuoteSource: 'catalog_price',
            ownerSourceUnitPriceMinor: '1234',
            ownerLockedExchangeRateDecimal: '76.5',
            ownerConvertedReferenceUnitMinor: '944',
            ownerMarkupJson: markup,
            ownerFinalUnitPriceMinor: final,
          },
        ],
      }),
      createdAt: 1,
    })
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              input?: Record<string, unknown>
              orderId?: string
              reason?: string
            },
          ) {
            if (command === 'search_catalog') {
              return Promise.resolve([
                {
                  id: '00000000-0000-4000-8000-000000000914',
                  sku: 'OWNER-CNY',
                  nameZh: '跨币种业主材料',
                  nameFr: null,
                  aliases: [],
                  brand: null,
                  model: 'OPA-CNY',
                  specification: 'fixture',
                  unit: '件',
                  notes: null,
                  version: 1,
                  prices: [
                    {
                      priceId: '00000000-0000-4000-8000-000000000915',
                      supplierId: '00000000-0000-4000-8000-000000000916',
                      supplierName: '审批报价供应商',
                      isPreferredSupplier: true,
                      currency: 'CNY',
                      unitPriceMinor: '1234',
                      unit: '件',
                      effectiveAt: '2026-10-12',
                    },
                  ],
                },
              ])
            }
            if (
              command === 'save_requisition_draft' ||
              command === 'set_procurement_mode'
            )
              return Promise.resolve({ totalMinor: '0' })
            if (command === 'save_owner_purchase_pricing') {
              pricingAttempt += 1
              if (pricingAttempt <= 2)
                return Promise.reject(new Error('rate unavailable'))
              const reason = args?.input?.revisionReason as string | null
              const revised = reason === '驳回后调整固定加价。'
              Object.assign(window, { __ownerLifecyclePricing: args?.input })
              return Promise.resolve([
                {
                  orderItemId: (
                    args?.input?.lines as Array<{ orderItemId: string }>
                  )[0].orderItemId,
                  convertedReferenceUnitMinor: '944',
                  markupMinor: revised ? '10' : '94',
                  finalUnitPriceMinor: revised ? '954' : '1038',
                },
              ])
            }
            if (command === 'submit_requisition_draft') return Promise.resolve()
            if (command === 'list_order_comments') return Promise.resolve([])
            if (command === 'list_order_audits') {
              if (rejected) {
                return Promise.resolve([
                  pricingAudit(
                    '驳回后调整固定加价。',
                    '954',
                    '{"kind":"fixed_minor","minor":"10"}',
                  ),
                  {
                    id: crypto.randomUUID(),
                    orderId,
                    actorId: purchaserId,
                    action: 'rejected',
                    reason: '请调整加价。',
                    previousJson: 'pending_confirmation',
                    nextJson: 'rejected',
                    createdAt: 2,
                  },
                ])
              }
              return Promise.resolve([
                pricingAudit(
                  null,
                  '1038',
                  '{"kind":"percent_basis_points","basisPoints":1000}',
                ),
              ])
            }
            if (command === 'reject_requisition') {
              rejected = true
              return Promise.resolve()
            }
            return Promise.reject(new Error(`unexpected command: ${command}`))
          },
        },
      },
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await page.getByRole('button', { name: '采购申请单', exact: true }).click()
  await page.getByLabel('采购模式').click()
  await page.getByText('业主自行采购', { exact: true }).click()
  await page.getByLabel('材料').click()
  await page.getByText('跨币种业主材料 · OPA-CNY', { exact: true }).click()
  await page.getByLabel('选择报价').click()
  await page.getByText(/审批报价供应商 ·/).click()
  await page.getByLabel('CNY → XOF 锁定汇率').fill('76.5')
  await page.getByRole('textbox', { name: '加价', exact: true }).fill('1000')
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByText('基础草稿已保存，报价定价未完成')).toBeVisible()
  await page.getByRole('button', { name: '提交确认' }).click()
  await expect(page.getByText('提交失败，请检查订单内容。')).toBeVisible()
  await page.getByRole('button', { name: '提交确认' }).click()
  await expect(page.getByText('采购申请已提交，状态：待确认')).toBeVisible()
  await expect(
    page.getByText('供应商：审批报价供应商 · 原始价格：1234 CNY · 汇率：76.5'),
  ).toBeVisible()
  await expect(
    page.getByText(/换算参考价：944 · 加价：.*1000.*最终价格：1038/),
  ).toBeVisible()
  await page.getByLabel('驳回原因').fill('请调整加价。')
  await page.getByRole('button', { name: '驳回订单' }).click()
  await expect(
    page.getByText('申请已驳回，可修改报价并重新提交。'),
  ).toBeVisible()
  await page.getByLabel('加价方式').click()
  await page.getByText('固定每单位金额', { exact: true }).click()
  await page.getByRole('textbox', { name: '加价', exact: true }).fill('10')
  await page.getByLabel('价格修订原因').fill('驳回后调整固定加价。')
  await page.getByRole('button', { name: '提交确认' }).click()
  await expect(
    page.getByText('报价修订原因：驳回后调整固定加价。'),
  ).toBeVisible()
  await expect(page.getByText(/最终价格：954/)).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('regular owner draft marks manual reference pricing as an exception', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(command: string, args?: { input?: Record<string, unknown> }) {
            if (command === 'search_catalog')
              return Promise.resolve([
                {
                  id: '00000000-0000-4000-8000-000000000921',
                  sku: 'MANUAL',
                  nameZh: '手工报价材料',
                  nameFr: null,
                  aliases: [],
                  brand: null,
                  model: 'OPA-MANUAL',
                  specification: 'fixture',
                  unit: '件',
                  notes: null,
                  version: 1,
                  prices: [],
                },
              ])
            if (
              command === 'save_requisition_draft' ||
              command === 'set_procurement_mode'
            )
              return Promise.resolve({ totalMinor: '0' })
            if (command === 'save_owner_purchase_pricing') {
              Object.assign(window, { __manualOwnerPricing: args?.input })
              return Promise.resolve([
                {
                  orderItemId: (
                    args?.input?.lines as Array<{ orderItemId: string }>
                  )[0].orderItemId,
                  convertedReferenceUnitMinor: '100',
                  markupMinor: '0',
                  finalUnitPriceMinor: '100',
                },
              ])
            }
            return Promise.reject(new Error(`unexpected command: ${command}`))
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await page.getByRole('button', { name: '采购申请单', exact: true }).click()
  await page.getByLabel('采购模式').click()
  await page.getByText('业主自行采购', { exact: true }).click()
  await page.getByLabel('材料').click()
  await page.getByText('手工报价材料 · OPA-MANUAL', { exact: true }).click()
  await page.getByLabel('报价来源').click()
  await page.getByText('手工参考价（需原因）', { exact: true }).click()
  await expect(
    page.getByText('手工参考价会被审计，且不会写回材料目录。'),
  ).toBeVisible()
  await page.getByLabel('手工参考单价（最小货币单位）').fill('100')
  await page.getByLabel('手工参考原因').fill('目录暂无可用报价。')
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(
    page.evaluate(
      () =>
        (
          window as Window & {
            __manualOwnerPricing?: {
              lines?: Array<{
                quoteSource?: { kind?: string; reason?: string }
              }>
            }
          }
        ).__manualOwnerPricing?.lines?.[0]?.quoteSource,
    ),
  ).resolves.toEqual({
    kind: 'manual_reference',
    unitPriceMinor: '100',
    reason: '目录暂无可用报价。',
  })
})

test('currency preview selects every supported currency without console errors', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await page.goto('/?test=money')
  const currency = page.getByLabel('预览货币')
  const formattedMoney = page.getByTestId('formatted-money')

  for (const value of ['XOF', 'CNY', 'USD', 'EUR']) {
    await currency.selectOption(value)
    await expect(formattedMoney).toContainText(
      value === 'XOF' ? '1,234' : '12.34',
    )
  }

  await expect(browserErrors).toEqual([])
})

test('authentication fixture exposes invalid and first-login states', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await page.goto('/?test=auth')
  await page.getByLabel('账号').fill('test-admin')
  await page.getByLabel('密码').fill('wrong-password')
  await page.getByLabel('验证码：3 + 4 = ?').fill('7')
  await page.getByRole('button', { name: '验证登录' }).click()
  await expect(page.getByText('账号、密码或验证码无效')).toBeVisible()

  await page.getByLabel('密码').fill('fixture-password')
  await page.getByRole('button', { name: '验证登录' }).click()
  await expect(page.getByText('验证成功：首次登录需要修改密码')).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('offline login fixture locks idle engineers and denies a DOM-tampered material edit', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await page.goto('/?test=offline')
  await page.getByRole('button', { name: '模拟工程师离线登录' }).click()
  await expect(page.getByText('缓存账户已登录：工程师')).toBeVisible()

  await page.getByRole('button', { name: '模拟 30 分钟空闲' }).click()
  await expect(page.getByText('会话已锁定，需要重新输入密码')).toBeVisible()
  await page.getByRole('button', { name: '重新验证' }).click()

  const materialEdit = page.getByTestId('material-edit-control')
  await expect(materialEdit).toBeDisabled()
  await materialEdit.evaluate((button) => button.removeAttribute('disabled'))
  await materialEdit.click()
  await expect(page.getByText('可信边界拒绝：权限不足')).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('administrator changes project defaults and sees the selected project values', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await page.goto('/?test=master-data')
  await expect(page.getByText('Bethel2工地')).toBeVisible()
  await expect(
    page.getByLabel('项目默认值').getByText('科特迪瓦 TVA 18%'),
  ).toBeVisible()

  await page.getByLabel('选择项目').click()
  await page.getByText('Minrex数据中心', { exact: true }).last().click()
  await expect(page.getByTestId('selected-project')).toHaveText(
    'Minrex数据中心',
  )
  await expect(
    page.getByLabel('项目默认值').getByText('中文 + 英文'),
  ).toBeVisible()
  await expect(page.getByText('未设置默认税率')).toBeVisible()

  await page.getByLabel('页脚联系方式').fill('fixture updated contact')
  await page.getByRole('button', { name: '保存项目默认值' }).click()
  await expect(page.getByText('项目默认值已保存')).toBeVisible()
  await page.getByLabel('页脚联系方式').fill('')
  await expect(
    page.getByRole('button', { name: '保存项目默认值' }),
  ).toBeEnabled()
  await page.getByRole('button', { name: '保存项目默认值' }).click()
  await expect(page.getByText('项目默认值已保存')).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('project defaults offer only an eligible tax template for the selected country', async ({
  page,
}) => {
  await page.goto('/?test=master-data')
  await page.getByRole('combobox', { name: '默认税模板' }).click()
  await expect(
    page
      .locator('.ant-select-dropdown:visible')
      .getByText('科特迪瓦 TVA 18%', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('选择项目').click()
  await page.getByText('Minrex数据中心', { exact: true }).last().click()
  await page.getByRole('combobox', { name: '默认税模板' }).click()
  await expect(
    page
      .locator('.ant-select-dropdown:visible')
      .getByText('科特迪瓦 TVA 18%', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page
      .locator('.ant-select-dropdown:visible')
      .getByText('不使用默认税模板', { exact: true }),
  ).toBeVisible()
})

test('administrator master-data fixture adds a country', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.goto('/?test=master-data')
  await page.getByRole('tab', { name: '国家' }).click()
  await page.getByLabel('国家代码').fill('SN')
  await page.getByLabel('国家名称', { exact: true }).fill('塞内加尔')
  await page.getByLabel('国家时区', { exact: true }).fill('Africa/Dakar')
  await page.getByRole('button', { name: '新增国家' }).click()
  await expect(page.getByText('基础资料已保存；等待同步确认')).toBeVisible()
  await expect(page.getByLabel('编辑国家名称-SN')).toHaveValue('塞内加尔')
  await expect(browserErrors).toEqual([])
})

test('administrator can create, edit and disable a unit offline', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.goto('/?test=master-data')
  await page.getByRole('tab', { name: '单位' }).click()
  await expect(page.getByRole('button', { name: '新增单位' })).toBeDisabled()
  await page.getByLabel('单位代码').fill('fixture-ea')
  await page.getByLabel('单位名称', { exact: true }).fill('Each')
  await page.getByRole('button', { name: '新增单位' }).click()
  await expect(page.getByLabel('编辑单位名称-fixture-ea')).toHaveValue('Each')
  await page.getByLabel('编辑单位名称-fixture-ea').fill('Piece')
  await page.getByLabel('编辑单位名称-fixture-ea').blur()
  await expect(page.getByLabel('编辑单位名称-fixture-ea')).toHaveValue('Piece')
  await page.getByRole('button', { name: /停\s*用/ }).click()
  await expect(page.getByRole('button', { name: /启\s*用/ })).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('administrator can create, rename and disable a material category offline', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.goto('/?test=master-data')
  await page.getByRole('tab', { name: '材料分类' }).click()
  await page.getByLabel('材料分类代码').fill('fixture-electrical')
  await page.getByLabel('材料分类名称').fill('Electrical')
  await page.getByRole('button', { name: '新增材料分类' }).click()
  await expect(
    page.getByLabel('编辑材料分类名称-fixture-electrical'),
  ).toHaveValue('Electrical')
  await page
    .getByLabel('编辑材料分类名称-fixture-electrical')
    .fill('Electrical revised')
  await page.getByLabel('编辑材料分类名称-fixture-electrical').blur()
  await expect(
    page.getByLabel('编辑材料分类名称-fixture-electrical'),
  ).toHaveValue('Electrical revised')
  await page.getByRole('button', { name: /停\s*用/ }).click()
  await expect(page.getByRole('button', { name: /启\s*用/ })).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('administrator can create, rename and disable a tax template offline', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.goto('/?test=master-data')
  await expect(page.getByRole('button', { name: '新增税模板' })).toBeDisabled()
  await page.getByLabel('税模板代码').fill('fixture-tax')
  await page.getByLabel('税模板名称', { exact: true }).fill('Fixture tax')
  await page.getByLabel('税率（基点）', { exact: true }).fill('1800')
  await page.getByLabel('税模板生效日期').fill('2026-10-15')
  await page.getByRole('button', { name: '新增税模板' }).click()
  await expect(page.getByLabel('编辑税模板名称-fixture-tax')).toHaveValue(
    'Fixture tax',
  )
  await page.getByRole('combobox', { name: '默认税模板' }).click()
  await expect(
    page
      .locator('.ant-select-dropdown:visible')
      .getByText('Fixture tax', { exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByLabel('编辑税模板名称-fixture-tax').fill('Revised tax')
  await page.getByLabel('编辑税率（基点）-fixture-tax').fill('1900')
  await page.getByLabel('编辑税模板生效日期-fixture-tax').fill('2026-11-01')
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByLabel('编辑税模板名称-fixture-tax')).toHaveValue(
    'Revised tax',
  )
  await expect(page.getByLabel('编辑税率（基点）-fixture-tax')).toHaveValue(
    '1900',
  )
  await expect(page.getByLabel('编辑税模板生效日期-fixture-tax')).toHaveValue(
    '2026-11-01',
  )
  await page
    .getByLabel('税模板维护')
    .getByRole('button', { name: /停\s*用/ })
    .click()
  await expect(
    page.getByLabel('税模板维护').getByRole('button', { name: /启\s*用/ }),
  ).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('administrator archives a manual exchange rate with a reason', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.goto('/?test=master-data')
  await page.getByLabel('源币种').click()
  await page.getByText('XOF', { exact: true }).last().click()
  await page.getByLabel('目标币种').click()
  await page.getByText('EUR', { exact: true }).last().click()
  await page.getByLabel('汇率小数字符串').fill('0.00152449')
  await page.getByLabel('汇率生效日期').fill('2026-10-15')
  await expect(
    page.getByRole('button', { name: '新增手工汇率' }),
  ).toBeDisabled()
  await page.getByLabel('手工汇率原因').fill('Fixture manual reference')
  await page.getByRole('button', { name: '新增手工汇率' }).click()
  await expect(
    page.getByLabel('汇率历史').getByText('0.00152449'),
  ).toBeVisible()
  await expect(page.getByText('手工汇率已归档；等待同步确认')).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('administrator creates a department and team with an explicit parent', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.goto('/?test=master-data')
  await page.getByRole('tab', { name: '部门' }).click()
  await page.getByLabel('部门代码').fill('fixture-proc')
  await page.getByLabel('部门名称', { exact: true }).fill('Procurement')
  await page.getByRole('button', { name: '新增部门' }).click()
  await expect(page.getByLabel('编辑部门名称-fixture-proc')).toHaveValue(
    'Procurement',
  )

  await page.getByRole('tab', { name: '团队' }).click()
  await page.getByLabel('团队代码').fill('fixture-team')
  await page.getByLabel('团队名称', { exact: true }).fill('Site team')
  await expect(page.getByRole('button', { name: '新增团队' })).toBeDisabled()
  await page.getByLabel('团队所属部门').click()
  await page.getByText('Procurement', { exact: true }).last().click()
  await page.getByRole('button', { name: '新增团队' }).click()
  await expect(page.getByLabel('编辑团队名称-fixture-team')).toHaveValue(
    'Site team',
  )
  await page.getByLabel('编辑团队名称-fixture-team').fill('Field team')
  await page.getByLabel('编辑团队名称-fixture-team').blur()
  await page.getByRole('button', { name: /停\s*用/ }).click()
  await expect(page.getByRole('button', { name: /启\s*用/ })).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('administrator master-data fixture creates a project and a site', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.goto('/?test=master-data')
  await page.getByRole('tab', { name: '项目', exact: true }).click()
  await page.getByLabel('项目代码').fill('SN-P1')
  await page.getByLabel('项目名称', { exact: true }).fill('塞内加尔项目')
  await page.getByLabel('项目国家', { exact: true }).click()
  await page.getByText('科特迪瓦', { exact: true }).last().click()
  await page.getByLabel('项目默认站点').fill('达喀尔')
  await page.getByLabel('项目部门').fill('项目部')
  await page.getByRole('button', { name: '新增项目' }).click()
  await expect(page.getByLabel('编辑项目名称-SN-P1')).toHaveValue(
    '塞内加尔项目',
  )

  await page.getByRole('tab', { name: '项目站点' }).click()
  await page.getByLabel('站点代码').fill('SN-P1-DAK')
  await page.getByLabel('站点名称').fill('达喀尔现场')
  await page.getByLabel('站点项目').click()
  await page.getByText('塞内加尔项目', { exact: true }).last().click()
  await page.getByRole('button', { name: '新增站点' }).click()
  await expect(page.getByLabel('编辑站点名称-SN-P1-DAK')).toHaveValue(
    '达喀尔现场',
  )
  expect(browserErrors).toEqual([])
})

test('desktop project-default page uses the Tauri command adapter', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    const projects = [
      {
        projectId: '43e62f6f-8069-460d-8fa5-16e4d4800cd4',
        projectName: 'Bethel2办公楼项目',
        site: 'Bethel2工地',
        departmentTitle: '科特迪瓦项目部',
        companyAddress: 'fixture address',
        companyContact: 'fixture contact',
        defaultCurrency: 'XOF',
        defaultLanguagePair: 'zh_fr',
        defaultTaxTemplateId: null,
        taxTemplateName: null,
      },
    ]
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(command: string) {
            if (command === 'list_project_defaults')
              return Promise.resolve(projects)
            if (command === 'list_reference_master_data')
              return Promise.resolve([])
            if (command === 'list_tax_templates') return Promise.resolve([])
            if (command === 'list_exchange_rates') return Promise.resolve([])
            if (command === 'save_project_defaults') return Promise.resolve()
            return Promise.reject(new Error('unexpected command'))
          },
        },
      },
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await page.getByRole('button', { name: '基础资料管理' }).click()
  await expect(
    page.getByRole('heading', { name: '基础资料管理' }).last(),
  ).toBeVisible()
  await expect(page.getByText('Bethel2工地')).toBeVisible()
  await page.getByLabel('页脚联系方式').fill('desktop fixture contact')
  await page.getByRole('button', { name: '保存项目默认值' }).click()
  await expect(page.getByText('项目默认值已保存')).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('engineer can search local catalog quotes but has no material mutation control', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await page.goto('/?test=catalog')
  await expect(page.getByText('fixture supplier D')).toBeVisible()
  await page.getByLabel('搜索材料').fill('FX-01')
  await expect(page.getByText('测试电缆')).toBeVisible()
  await page.getByLabel('搜索材料').fill('不存在的材料')
  await expect(page.getByRole('status')).toHaveText('未找到匹配材料')
  await expect(page.getByRole('button', { name: '新增材料' })).toHaveCount(0)
  await expect(
    page.getByText('工程师与查看者仅可搜索和查看材料及供应商价格。'),
  ).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('purchaser saves a material through the Tauri catalog boundary', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              material?: { nameZh?: string }
              image?: { squareCropBase64?: string }
            },
          ) {
            if (command === 'search_catalog') return Promise.resolve([])
            if (command === 'save_material') {
              Object.assign(window, {
                __catalogSaveName: args?.material?.nameZh,
              })
              return Promise.resolve()
            }
            if (command === 'save_material_image') {
              Object.assign(window, {
                __imageSaveSquare: args?.image?.squareCropBase64,
              })
              return Promise.resolve()
            }
            return Promise.reject(new Error('unexpected command'))
          },
        },
      },
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await page.getByRole('button', { name: '材料库', exact: true }).click()
  await page.getByRole('button', { name: '新增材料' }).click()
  await page.getByLabel('材料名称').fill('边界测试材料')
  await page.getByLabel('型号').fill('FX-02')
  await page.getByLabel('规格').fill('fixture specification')
  await page.getByLabel('单位').fill('件')
  await page.getByLabel('选择材料图片').setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL+XQAAAABJRU5ErkJggg==',
      'base64',
    ),
  })
  await expect(page.getByLabel('方形裁剪预览')).toBeVisible()
  await page.getByLabel('裁剪缩放').press('ArrowRight')
  await page.getByRole('button', { name: '保存材料' }).click()
  await expect(page.getByText('材料及图片已保存')).toBeVisible()
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __catalogSaveName?: string }).__catalogSaveName,
    ),
  ).resolves.toBe('边界测试材料')
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __imageSaveSquare?: string }).__imageSaveSquare,
    ),
  ).resolves.toMatch(/^iVBOR/)
  await expect(browserErrors).toEqual([])
})

test('purchaser maintains a supplier and material quote through Tauri commands', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    const material = {
      id: '00000000-0000-4000-8000-000000000001',
      sku: null,
      nameZh: '报价测试材料',
      nameFr: null,
      aliases: [],
      brand: null,
      model: 'QT-01',
      specification: 'fixture',
      unit: '件',
      notes: null,
      version: 1,
      prices: [],
    }
    const supplier = {
      id: '00000000-0000-4000-8000-000000000002',
      businessCode: 'SUP-001',
      countryId: '00000000-0000-4000-8000-000000000103',
      name: 'fixture active supplier',
      contactName: null,
      address: null,
      city: null,
      country: null,
      phone: null,
      whatsapp: null,
      email: null,
      paymentTerms: null,
      deliveryLeadTime: null,
      isPreferred: true,
      isBlacklisted: false,
      isActive: true,
      version: 1,
    }
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              supplier?: { name?: string; countryId?: string }
              price?: { unitPriceMinor?: string }
            },
          ) {
            if (command === 'search_catalog') return Promise.resolve([material])
            if (command === 'list_suppliers') return Promise.resolve([supplier])
            if (command === 'save_supplier') {
              Object.assign(window, {
                __supplierSaveName: args?.supplier?.name,
                __supplierSaveCountry: args?.supplier?.countryId,
              })
              return Promise.resolve()
            }
            if (command === 'add_material_price') {
              Object.assign(window, {
                __priceSaveMinor: args?.price?.unitPriceMinor,
              })
              return Promise.resolve()
            }
            return Promise.resolve()
          },
        },
      },
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await page.getByRole('button', { name: '材料库', exact: true }).click()
  await page.getByRole('button', { name: '供应商管理' }).click()
  await page.getByRole('button', { name: '新增供应商' }).click()
  await page.getByLabel('供应商编码').fill('SUP-NEW')
  await page.getByLabel('供应商名称').fill('新建测试供应商')
  await page.getByRole('button', { name: '保存供应商' }).click()
  await expect(page.getByText('供应商已保存')).toBeVisible()
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __supplierSaveName?: string }).__supplierSaveName,
    ),
  ).resolves.toBe('新建测试供应商')
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __supplierSaveCountry?: string })
          .__supplierSaveCountry,
    ),
  ).resolves.toBe('00000000-0000-4000-8000-000000000101')
  await page.getByRole('button', { name: '编辑供应商' }).click()
  await page.getByRole('button', { name: '保存供应商' }).click()
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __supplierSaveCountry?: string })
          .__supplierSaveCountry,
    ),
  ).resolves.toBe('00000000-0000-4000-8000-000000000103')
  await page.getByRole('button', { name: '关闭供应商管理' }).click()

  await page.getByRole('button', { name: '维护报价' }).click()
  await page.getByRole('combobox', { name: /供应商/ }).click()
  await page.getByText('SUP-001 · fixture active supplier').click()
  await page.getByLabel('单价（最小货币单位）').fill('1250')
  await page.getByRole('button', { name: '保存报价' }).click()
  await expect(page.getByText('供应商报价已保存')).toBeVisible()
  await expect(
    page.evaluate(
      () => (window as Window & { __priceSaveMinor?: string }).__priceSaveMinor,
    ),
  ).resolves.toBe('1250')
  await expect(browserErrors).toEqual([])
})

test('purchaser creates, edits and submits a requisition through Tauri commands', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    const material = {
      id: '00000000-0000-4000-8000-000000000201',
      sku: 'FIXTURE-REQ',
      nameZh: '请购测试电缆',
      nameFr: 'Câble de demande',
      aliases: [],
      brand: null,
      model: 'RQ-01',
      specification: 'fixture specification',
      unit: '米',
      notes: null,
      version: 1,
      prices: [
        {
          priceId: '00000000-0000-4000-8000-000000000202',
          supplierId: '00000000-0000-4000-8000-000000000203',
          supplierName: 'fixture requisition supplier',
          isPreferredSupplier: true,
          currency: 'XOF',
          unitPriceMinor: '1250',
          unit: '米',
          effectiveAt: '2026-10-10',
        },
      ],
    }
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              draft?: { lines?: unknown[]; id?: string }
              orderId?: string
              mode?: string
              projectId?: string
            },
          ) {
            if (command === 'search_catalog') {
              Object.assign(window, { __catalogProjectId: args?.projectId })
              return Promise.resolve([material])
            }
            if (command === 'save_requisition_draft') {
              Object.assign(window, { __requisitionDraft: args?.draft })
              return Promise.resolve({
                subtotalMinor: '3125',
                lineDiscountMinor: '125',
                orderDiscountMinor: '0',
                freightMinor: '0',
                taxMinor: '540',
                totalMinor: '3540',
              })
            }
            if (command === 'set_procurement_mode') {
              Object.assign(window, { __honsenProcurementMode: args?.mode })
              return Promise.resolve()
            }
            if (command === 'submit_requisition_draft') {
              Object.assign(window, { __submittedRequisitionId: args?.orderId })
              return Promise.resolve()
            }
            if (command === 'withdraw_requisition') {
              Object.assign(window, { __withdrawnRequisitionId: args?.orderId })
              return Promise.resolve()
            }
            return Promise.reject(new Error(`unexpected command: ${command}`))
          },
        },
      },
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await page.getByRole('button', { name: '采购申请单', exact: true }).click()
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __catalogProjectId?: string }).__catalogProjectId,
    ),
  ).resolves.toMatch(/^[0-9a-f-]{36}$/)
  await page.getByLabel('材料').click()
  await page.getByText('请购测试电缆 · RQ-01').click()
  await page.getByLabel('数量').fill('2.5')
  await page.getByLabel('行折扣（最小货币单位）').fill('125')
  await expect(page.getByLabel('税率（基点）')).toHaveValue('0')
  await page.getByLabel('税率（基点）').fill('1800')
  await expect(page.getByLabel('订单总金额')).toHaveText('3540 XOF')
  await page.getByRole('button', { name: '新增材料行' }).click()
  await expect(page.getByText('第 2 行')).toBeVisible()
  await page.getByLabel('材料').last().click()
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .last()
    .getByText('请购测试电缆 · RQ-01')
    .click()
  await page.getByLabel('行币种').last().click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('订单总金额')).toHaveText(
    '待供应商拆单后汇总主币种',
  )
  await expect(page.getByText(/源币种小计：/)).toBeVisible()
  await page.getByRole('button', { name: '删除第 2 行' }).click()
  await expect(page.getByText('第 2 行')).not.toBeVisible()
  await page.getByRole('button', { name: '提交确认' }).click()
  await expect(page.getByText('采购申请已提交，状态：待确认')).toBeVisible()
  await expect(page.locator('.page-heading .status')).toHaveText('待确认')
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __requisitionDraft?: { lines?: unknown[] } })
          .__requisitionDraft?.lines?.length,
    ),
  ).resolves.toBe(1)
  await expect(
    page.evaluate(
      () =>
        (
          window as Window & {
            __requisitionDraft?: {
              lines?: Array<{ supplierId?: string | null }>
            }
          }
        ).__requisitionDraft?.lines?.[0]?.supplierId,
    ),
  ).resolves.toBe('00000000-0000-4000-8000-000000000203')
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __submittedRequisitionId?: string })
          .__submittedRequisitionId,
    ),
  ).resolves.toMatch(/^[0-9a-f-]{36}$/)
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __honsenProcurementMode?: string })
          .__honsenProcurementMode,
    ),
  ).resolves.toBe('honsen_self_purchase')
  await page.getByRole('button', { name: '撤回申请' }).click()
  await expect(
    page.getByText('申请已撤回为草稿，审计记录已保留。'),
  ).toBeVisible()
  await expect(page.locator('.page-heading .status')).toHaveText('草稿')
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __withdrawnRequisitionId?: string })
          .__withdrawnRequisitionId,
    ),
  ).resolves.toMatch(/^[0-9a-f-]{36}$/)
  await expect(browserErrors).toEqual([])
})

test('purchaser allocates every parent line into supplier-specific child orders', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              parentOrderId?: string
              allocations?: Array<{
                supplierId?: string
                currency?: string
                childDisplayNo?: string
                lockedExchangeRateDecimal?: string
              }>
            },
          ) {
            if (command !== 'allocate_supplier_child_orders') {
              return Promise.reject(new Error(`unexpected command: ${command}`))
            }
            Object.assign(window, { __supplierAllocations: args })
            return Promise.resolve(
              args?.allocations?.map((allocation, index) => ({
                childOrderId: `00000000-0000-4000-8000-00000000041${index}`,
                supplierId: allocation.supplierId,
                currency: allocation.currency,
                sourceTotalMinor: index === 0 ? '3125' : '900',
                primaryTotalMinor: index === 0 ? '3125' : '554000',
                lockedExchangeRateDecimal: allocation.lockedExchangeRateDecimal,
              })) ?? [],
            )
          },
        },
      },
    })
  })

  await page.goto('/?test=allocation')
  await page.getByLabel('fixture cable 供应商').click()
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .last()
    .getByText('fixture supplier A', { exact: true })
    .click()
  await page
    .getByLabel('fixture cable 子单编号')
    .fill('CI-FIXTURE-20261011-SUP-001-0001')
  await page.getByLabel('fixture pipe 供应商').click()
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .last()
    .getByText('fixture supplier B', { exact: true })
    .click()
  await page
    .getByLabel('fixture pipe 子单编号')
    .fill('CI-FIXTURE-20261011-SUP-002-0001')
  await page.getByLabel('fixture pipe 锁定汇率').fill('615.5')
  await page.getByRole('button', { name: '创建供应商子单' }).click()
  await expect(
    page.getByText('已创建 2 张供应商子单，父单明细分配已锁定。'),
  ).toBeVisible()
  await expect(
    page.getByText('USD · 900 · 锁定汇率 615.5 · 主币种合计 554000'),
  ).toBeVisible()
  await expect(
    page.evaluate(
      () =>
        (
          window as Window & {
            __supplierAllocations?: {
              parentOrderId?: string
              allocations?: Array<{
                currency?: string
                supplierId?: string
              }>
            }
          }
        ).__supplierAllocations,
    ),
  ).resolves.toMatchObject({
    parentOrderId: '00000000-0000-4000-8000-000000000401',
    allocations: [
      {
        supplierId: '00000000-0000-4000-8000-000000000402',
        currency: 'XOF',
      },
      {
        supplierId: '00000000-0000-4000-8000-000000000403',
        currency: 'USD',
      },
    ],
  })
  await expect(browserErrors).toEqual([])
})

test('purchaser reaches execution from the regular application and completes RFQ, allocation and child terms', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    let allocated = false
    const rfqs: Array<Record<string, unknown>> = []
    const parent = {
      id: '00000000-0000-4000-8000-000000000801',
      displayNo: 'CI-FIXTURE-20261012-INT-0001',
      primaryCurrency: 'XOF',
      procurementMode: 'honsen_self_purchase',
      workflowStatus: 'confirmed',
      lines: [
        {
          id: '00000000-0000-4000-8000-000000000802',
          materialName: 'regular flow cable',
          quantity: '2',
          unit: '米',
          currency: 'XOF',
        },
      ],
    }
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              input?: Record<string, unknown>
              rfqId?: string
              sourceOrderId?: string
              allocations?: Array<Record<string, unknown>>
            },
          ) {
            if (command === 'list_confirmed_procurement_orders')
              return Promise.resolve([
                {
                  ...parent,
                  children: allocated
                    ? [
                        {
                          id: '00000000-0000-4000-8000-000000000803',
                          displayNo: 'CI-FIXTURE-20261012-SUP-0001',
                          currency: 'XOF',
                          lines: [
                            {
                              ...parent.lines[0],
                              id: '00000000-0000-4000-8000-000000000804',
                            },
                          ],
                        },
                      ]
                    : [],
                },
                {
                  ...parent,
                  id: '00000000-0000-4000-8000-000000000806',
                  displayNo: 'CI-FIXTURE-20261012-INT-0002',
                  children: [],
                },
              ])
            if (command === 'list_suppliers')
              return Promise.resolve([
                {
                  id: '00000000-0000-4000-8000-000000000805',
                  businessCode: 'SUP-FIXTURE',
                  name: 'regular flow supplier',
                  contactName: null,
                  address: null,
                  city: null,
                  country: null,
                  phone: null,
                  whatsapp: null,
                  email: null,
                  paymentTerms: null,
                  deliveryLeadTime: null,
                  isPreferred: true,
                  isBlacklisted: false,
                  isActive: true,
                  version: 1,
                },
              ])
            if (command === 'list_rfqs')
              return Promise.resolve(
                rfqs.filter((rfq) => rfq.sourceOrderId === args?.sourceOrderId),
              )
            if (command === 'create_rfq') {
              const rfq = { ...args?.input, itemCount: 1, status: 'draft' }
              rfqs.push(rfq)
              return Promise.resolve(rfq)
            }
            if (command === 'send_rfq' || command === 'close_rfq') {
              const rfq = rfqs.find((value) => value.id === args?.rfqId)
              if (!rfq) return Promise.reject(new Error('RFQ not found'))
              rfq.status = command === 'send_rfq' ? 'sent' : 'closed'
              return Promise.resolve()
            }
            if (command === 'allocate_supplier_child_orders') {
              allocated = true
              return Promise.resolve([
                {
                  childOrderId: '00000000-0000-4000-8000-000000000803',
                  supplierId: '00000000-0000-4000-8000-000000000805',
                  currency: 'XOF',
                  sourceTotalMinor: '2500',
                  primaryTotalMinor: '2500',
                  lockedExchangeRateDecimal: '1',
                },
              ])
            }
            if (command === 'save_supplier_child_terms')
              return Promise.resolve({
                subtotalMinor: '2500',
                lineDiscountMinor: '0',
                orderDiscountMinor: '0',
                freightMinor: '0',
                taxMinor: '450',
                totalMinor: '2950',
              })
            if (command === 'send_supplier_order') return Promise.resolve()
            return Promise.reject(new Error(`unexpected command: ${command}`))
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await page.getByRole('button', { name: '采购执行', exact: true }).click()
  await page
    .getByRole('button', { name: 'CI-FIXTURE-20261012-INT-0001' })
    .click()
  await expect(page.getByText('regular flow cable · 2 米 · XOF')).toBeVisible()
  await page.getByLabel('RFQ 供应商').click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.getByLabel('询价单编号').fill('CI-FIXTURE-20261012-RFQ-0001')
  await page.getByRole('button', { name: '创建询价单' }).click()
  await expect(page.getByText(/已创建，包含 1 条无价格明细/)).toBeVisible()
  await page.getByRole('button', { name: '发送询价单' }).click()
  await expect(page.getByText('状态：已发送', { exact: true })).toBeVisible()
  await page.getByLabel('regular flow cable 供应商').click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page
    .getByLabel('regular flow cable 子单编号')
    .fill('CI-FIXTURE-20261012-SUP-0001')
  await page.getByRole('button', { name: '创建供应商子单' }).click()
  await expect(page.getByText('供应商子单条款')).toBeVisible()
  await expect(page.getByText('状态：已发送', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭询价单' }).click()
  await expect(page.getByText('状态：已关闭')).toBeVisible()
  await page.getByRole('button', { name: '保存子单条款' }).click()
  await expect(page.getByText('子单条款已保存，含税总额 2950。')).toBeVisible()
  await page
    .getByRole('button', { name: 'CI-FIXTURE-20261012-INT-0002' })
    .click()
  await expect(page.getByText('CI-FIXTURE-20261012-RFQ-0001')).toHaveCount(0)
  await expect(browserErrors).toEqual([])
})

test('Honsen market purchase records partial and final receipt without RFQ or supplier child', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    let status = 'confirmed'
    let receiptCount = 0
    const orderId = '00000000-0000-4000-8000-000000000811'
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              orderId?: string
              input?: { orderId: string; amountMinor?: string }
            },
          ) {
            if (command === 'list_confirmed_procurement_orders')
              return Promise.resolve(
                status === 'completed'
                  ? []
                  : [
                      {
                        id: orderId,
                        displayNo: 'HONSEN-MARKET-1',
                        primaryCurrency: 'XOF',
                        procurementMode: 'honsen_self_purchase',
                        workflowStatus: status,
                        children: [],
                        lines: [
                          {
                            id: '00000000-0000-4000-8000-000000000812',
                            materialName: 'market cement',
                            quantity: '2',
                            unit: '袋',
                            currency: 'XOF',
                            receivedQuantity:
                              receiptCount === 0
                                ? '0'
                                : receiptCount === 1
                                  ? '1'
                                  : '2',
                            remainingQuantity:
                              receiptCount === 0
                                ? '2'
                                : receiptCount === 1
                                  ? '1'
                                  : '0',
                          },
                        ],
                      },
                    ],
              )
            if (command === 'list_suppliers') return Promise.resolve([])
            if (command === 'list_rfqs') return Promise.resolve([])
            if (command === 'start_honsen_market_execution') {
              if (args?.orderId !== orderId)
                return Promise.reject(new Error('wrong order'))
              status = 'executing'
              return Promise.resolve()
            }
            if (command === 'record_receipt') {
              if (args?.input?.orderId !== orderId)
                return Promise.reject(new Error('wrong order'))
              receiptCount += 1
              status = receiptCount === 1 ? 'receiving' : 'completed'
              return Promise.resolve({
                id: crypto.randomUUID(),
                orderId,
                workflowStatus: status,
                receivedItemCount: 1,
              })
            }
            if (command === 'record_procurement_expenditure') {
              if (args?.input?.orderId !== orderId)
                return Promise.reject(new Error('wrong order'))
              Object.assign(window, { __paymentAmount: args.input.amountMinor })
              return Promise.resolve({
                id: crypto.randomUUID(),
                orderId,
                voucherWarning: true,
              })
            }
            return Promise.reject(new Error(`unexpected command: ${command}`))
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await page.getByRole('button', { name: '采购执行', exact: true }).click()
  await expect(page.getByRole('button', { name: '开始市场直采' })).toBeVisible()
  await page.getByRole('button', { name: '开始市场直采' }).click()
  await expect(page.getByLabel('收货状态')).toHaveText('采购执行中')
  await page.getByLabel('付款收款人').fill('fixture cash seller')
  await page.getByLabel('实际付款金额').fill('1200')
  await page.getByRole('button', { name: '登记付款' }).click()
  await expect(
    page.getByText('付款已登记；尚未附凭证，请后续补充。'),
  ).toBeVisible()
  await expect(
    page.evaluate(
      () => (window as Window & { __paymentAmount?: string }).__paymentAmount,
    ),
  ).resolves.toBe('1200')
  await page.getByLabel('market cement 实收数量').fill('1')
  await page.getByRole('button', { name: '登记收货' }).click()
  await expect(page.getByLabel('收货状态')).toHaveText('收货中')
  await expect(page.getByText('累计实收 1 袋 · 待收 1 袋')).toBeVisible()
  await page.getByLabel('market cement 实收数量').fill('1')
  await page.getByRole('button', { name: '登记收货' }).click()
  await expect(page.getByText('没有可执行的已确认采购申请')).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('purchaser creates a price-free RFQ through the Tauri boundary', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    const rfqs: Array<Record<string, unknown>> = []
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(command: string, args?: { input?: Record<string, unknown> }) {
            if (command === 'list_rfqs') return Promise.resolve(rfqs)
            if (command !== 'create_rfq')
              return Promise.reject(new Error(`unexpected command: ${command}`))
            Object.assign(window, { __rfqInput: args?.input })
            const rfq = { ...args?.input, itemCount: 2, status: 'draft' }
            rfqs.push(rfq)
            return Promise.resolve(rfq)
          },
        },
      },
    })
  })

  await page.goto('/?test=rfq')
  await page.getByLabel('RFQ 供应商').click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.getByLabel('询价单编号').fill('CI-FIXTURE-20261011-RFQ-0001')
  await page.getByRole('button', { name: '创建询价单' }).click()
  await expect(page.getByText(/已创建，包含 2 条无价格明细/)).toBeVisible()
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __rfqInput?: Record<string, unknown> })
          .__rfqInput,
    ),
  ).resolves.toMatchObject({
    sourceOrderId: '00000000-0000-4000-8000-000000000501',
    supplierId: '00000000-0000-4000-8000-000000000502',
    currency: 'XOF',
  })
  await expect(browserErrors).toEqual([])
})

test('purchaser completes supplier-child terms before sending the order', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: { input?: Record<string, unknown>; orderId?: string },
          ) {
            if (command === 'save_supplier_child_terms') {
              Object.assign(window, { __supplierTerms: args?.input })
              return Promise.resolve({ totalMinor: '3511' })
            }
            if (command === 'send_supplier_order') {
              Object.assign(window, { __sentSupplierOrder: args?.orderId })
              return Promise.resolve()
            }
            return Promise.reject(new Error(`unexpected command: ${command}`))
          },
        },
      },
    })
  })

  await page.goto('/?test=supplier-terms')
  await page.getByRole('button', { name: '发送供应商' }).click()
  await expect(page.getByText('请先保存税、折扣和运费条款。')).toBeVisible()
  await page.getByLabel('fixture cable 行折扣').fill('125')
  await page.getByLabel('fixture cable 行运费').fill('25')
  await page.getByLabel('子单税率').fill('1800')
  await page.getByLabel('子单单据折扣').fill('100')
  await page.getByLabel('子单单据运费').fill('50')
  await page.getByRole('button', { name: '保存子单条款' }).click()
  await expect(page.getByText('子单条款已保存，含税总额 3511。')).toBeVisible()
  await page.getByRole('button', { name: '发送供应商' }).click()
  await expect(
    page.getByText('供应商子单已发送，可开始登记收货。'),
  ).toBeVisible()
  await expect(
    page.evaluate(
      () =>
        (
          window as Window & {
            __supplierTerms?: {
              taxRateBasisPoints?: number
              lines?: Array<{ lineDiscount?: { minor?: string } }>
            }
          }
        ).__supplierTerms,
    ),
  ).resolves.toMatchObject({
    taxRateBasisPoints: 1800,
    lines: [{ lineDiscount: { minor: '125' } }],
  })
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __sentSupplierOrder?: string })
          .__sentSupplierOrder,
    ),
  ).resolves.toBe('00000000-0000-4000-8000-000000000451')
  await expect(browserErrors).toEqual([])
})

test('receiver records partial delivery and closes a supplier order with conditions', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: { input?: Record<string, unknown>; reason?: string },
          ) {
            if (command === 'record_receipt') {
              Object.assign(window, { __receiptInput: args?.input })
              return Promise.resolve({
                id: args?.input?.id,
                orderId: args?.input?.orderId,
                workflowStatus: 'sent',
                receivedItemCount: 1,
              })
            }
            if (command === 'close_supplier_order_with_conditions') {
              Object.assign(window, { __conditionalCloseReason: args?.reason })
              return Promise.resolve()
            }
            return Promise.reject(new Error(`unexpected command: ${command}`))
          },
        },
      },
    })
  })

  await page.goto('/?test=receipt')
  await page.getByLabel('fixture pipe 实收数量').fill('1')
  await page.getByRole('button', { name: '登记收货' }).click()
  await expect(page.getByText('收货已登记，共 1 条明细。')).toBeVisible()
  await expect(
    page.evaluate(
      () =>
        (
          window as Window & {
            __receiptInput?: { items?: Array<{ quantity?: string }> }
          }
        ).__receiptInput?.items?.[0]?.quantity,
    ),
  ).resolves.toBe('1')
  await page.getByRole('button', { name: '按有条件完成关闭' }).click()
  await expect(page.getByText('有条件完成原因必填。')).toBeVisible()
  await page.getByLabel('有条件完成原因').fill('现场缺少余料，按条件关闭。')
  await page.getByRole('button', { name: '按有条件完成关闭' }).click()
  await expect(page.getByLabel('收货状态')).toHaveText('已完成（有条件）')
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __conditionalCloseReason?: string })
          .__conditionalCloseReason,
    ),
  ).resolves.toBe('现场缺少余料，按条件关闭。')
  await expect(browserErrors).toEqual([])
})

test('administrator resolves a sync conflict through the accessible control', async ({
  page,
}) => {
  await page.goto('/?test=sync-conflict')
  await expect(page.getByText('云端版本 2 · upsert')).toBeVisible()
  await page.getByLabel('处理原因').fill('云端材料资料已核对')
  await page.getByRole('button', { name: '采用云端' }).click()
  await expect(page.getByRole('status')).toHaveText(
    '冲突已解决，并保留审计记录。',
  )
  await expect(page.getByText('没有待处理的同步冲突。')).toBeVisible()
})

test('administrator repairs a local category conflict with an explicit reason', async ({
  page,
}) => {
  await page.goto('/?test=sync-conflict')
  await expect(page.getByText('冲突分类 CAT-OLD')).toBeVisible()
  await page.getByLabel('分类新编码').fill('CAT-NEW')
  await page.getByLabel('分类修复原因').fill('编码重复')
  await page.getByRole('button', { name: '修复本地分类' }).click()
  await expect(
    page.getByText('已保留原事件并生成新的待同步事件。'),
  ).toBeVisible()
  await expect(page.getByText('冲突分类 CAT-OLD')).toHaveCount(0)
})

test('administrator can retry an uncertain remote repair after reload', async ({
  page,
}) => {
  await page.goto('/?test=sync-conflict&pending=1')
  await expect(page.getByText(/待确认的云端修复/)).toBeVisible()
  await page.getByRole('button', { name: '重试待确认修复' }).click()
  await expect(page.getByText('云端修复已确认，桌面同步已完成。')).toBeVisible()
  await expect(page.getByText(/待确认的云端修复/)).toHaveCount(0)
})

test('cross-account conflict resolution stays visible and gives an actionable error', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await page.goto('/?test=sync-conflict&deny=account')
  await page.getByLabel('处理原因').fill('核对另一账户的冲突')
  await page.getByRole('button', { name: '保留本地' }).click()
  await expect(page.getByRole('status')).toHaveText(
    '该冲突属于其他账户或未归属旧事件，当前账户不能处理。',
  )
  await expect(page.getByText('云端版本 2 · upsert')).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('purchaser rejects with a reason and posts an immutable internal comment', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              orderId?: string
              reason?: string
              body?: string
              allowSelfApproval?: boolean
            },
          ) {
            if (command === 'list_order_comments') {
              return Promise.resolve([
                {
                  id: '00000000-0000-4000-8000-000000000304',
                  orderId: args?.orderId,
                  authorId: '00000000-0000-4000-8000-000000000302',
                  body: '既有不可变评论',
                  createdAt: 0,
                  notificationCount: 0,
                },
              ])
            }
            if (command === 'list_order_audits') {
              return Promise.resolve([
                {
                  id: '00000000-0000-4000-8000-000000000305',
                  orderId: args?.orderId,
                  actorId: '00000000-0000-4000-8000-000000000302',
                  action: 'confirmed_revised',
                  reason: '采购员更正交付地址。',
                  previousJson: JSON.stringify({
                    deliveryAddress: '旧地址',
                    notes: null,
                  }),
                  nextJson: JSON.stringify({
                    deliveryAddress: '新地址',
                    notes: '已核对',
                  }),
                  createdAt: 0,
                },
              ])
            }
            if (command === 'get_approval_policy') {
              return Promise.resolve({ allowSelfApproval: false })
            }
            if (command === 'set_approval_policy') {
              Object.assign(window, {
                __approvalPolicyUpdate: {
                  allowSelfApproval: args?.allowSelfApproval,
                  reason: args?.reason,
                },
              })
              return Promise.resolve()
            }
            if (command === 'reject_requisition') {
              Object.assign(window, { __rejectionReason: args?.reason })
              return Promise.resolve()
            }
            if (command === 'add_order_comment') {
              return Promise.resolve({
                id: '00000000-0000-4000-8000-000000000303',
                orderId: args?.orderId,
                authorId: '00000000-0000-4000-8000-000000000302',
                body: args?.body,
                createdAt: 0,
                notificationCount: 1,
              })
            }
            return Promise.reject(new Error(`unexpected command: ${command}`))
          },
        },
      },
    })
  })

  await page.goto('/?test=workflow')
  await expect(page.getByText('既有不可变评论')).toBeVisible()
  await expect(page.getByText('修改原因：采购员更正交付地址。')).toBeVisible()
  await expect(page.getByText(/交付地址：旧地址 → 新地址/)).toBeVisible()
  await page.getByRole('button', { name: '保存策略' }).click()
  await expect(page.getByText('策略修改原因必填。')).toBeVisible()
  await page.getByLabel('允许自审').check()
  await page.getByLabel('策略修改原因').fill('临时授权自审。')
  await page.getByRole('button', { name: '保存策略' }).click()
  await expect(
    page.getByText('自审策略已更新，并已写入永久审计。'),
  ).toBeVisible()
  await expect(
    page.evaluate(
      () =>
        (
          window as Window & {
            __approvalPolicyUpdate?: {
              allowSelfApproval?: boolean
              reason?: string
            }
          }
        ).__approvalPolicyUpdate,
    ),
  ).resolves.toEqual({
    allowSelfApproval: true,
    reason: '临时授权自审。',
  })
  await page.getByRole('button', { name: '驳回订单' }).click()
  await expect(page.getByText('驳回原因必填。')).toBeVisible()
  await page.getByLabel('驳回原因').fill('规格不完整，请补充。')
  await page.getByRole('button', { name: '驳回订单' }).click()
  await expect(page.getByLabel('审批状态')).toHaveText('已驳回')
  await expect(
    page.evaluate(
      () =>
        (window as Window & { __rejectionReason?: string }).__rejectionReason,
    ),
  ).resolves.toBe('规格不完整，请补充。')
  await page.getByLabel('留言（支持 @某人）').fill('@申请人 请补充规格。')
  await page.getByRole('button', { name: '发送评论' }).click()
  await expect(page.getByText('@申请人 请补充规格。')).toBeVisible()
  await expect(
    page.getByText('评论已发送，已通知 1 位被提及成员；发送后不可编辑或删除。'),
  ).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('authenticated desktop switches between cached authorization scopes', async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.addInitScript(() => {
    const contexts = [
      {
        countryId: '00000000-0000-4000-8000-000000000001',
        projectId: '00000000-0000-4000-8000-000000000002',
        projectName: '项目甲',
        site: '甲工地',
        departmentId: '00000000-0000-4000-8000-000000000003',
        departmentName: '采购部',
        teamId: '00000000-0000-4000-8000-000000000004',
        teamName: '一班',
        currency: 'XOF',
        primaryCurrency: 'XOF',
        languagePair: 'zh_fr',
      },
      {
        countryId: '00000000-0000-4000-8000-000000000001',
        projectId: '00000000-0000-4000-8000-000000000005',
        projectName: '项目乙',
        site: '乙工地',
        departmentId: '00000000-0000-4000-8000-000000000003',
        departmentName: '采购部',
        teamId: '00000000-0000-4000-8000-000000000006',
        teamName: '二班',
        currency: 'XOF',
        primaryCurrency: 'XOF',
        languagePair: 'zh_fr',
      },
    ]
    let selected = contexts[0]
    let historicalStatus = 'pending_confirmation'
    Object.assign(window, {
      __setHistoryPending: () => {
        historicalStatus = 'pending_confirmation'
      },
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              selection?: { projectId: string }
              filter?: { query?: string }
              orderId?: string
            },
          ) {
            if (command === 'issue_local_captcha')
              return Promise.resolve({
                id: crypto.randomUUID(),
                question: '1 + 1 = ?',
              })
            if (command === 'issue_cloud_captcha')
              return Promise.reject(new Error('offline'))
            if (command === 'offline_login')
              return Promise.resolve({
                user_id: '00000000-0000-4000-8000-000000000007',
                username: 'fixture',
                roles: ['purchaser'],
                requires_password_change: false,
              })
            if (command === 'list_authorization_contexts')
              return Promise.resolve(contexts)
            if (command === 'get_authorization_context')
              return Promise.resolve(selected)
            if (command === 'select_authorization_context') {
              selected =
                contexts.find(
                  (context) => context.projectId === args?.selection?.projectId,
                ) ?? contexts[0]
              return Promise.resolve()
            }
            if (command === 'list_requisition_history')
              return Promise.resolve({
                records:
                  args?.filter?.query === '不存在'
                    ? []
                    : [
                        {
                          id: '00000000-0000-4000-8000-000000000009',
                          displayNo: 'REQ-HISTORY-1',
                          projectName: '项目乙',
                          site: '乙工地',
                          workflowStatus: historicalStatus,
                          procurementMode: 'owner_self_purchase',
                          primaryCurrency: 'XOF',
                          totalMinor: '1200',
                          updatedAt: 1,
                        },
                      ],
                nextCursor: null,
              })
            if (command === 'get_requisition_detail')
              return Promise.resolve({
                id: '00000000-0000-4000-8000-000000000009',
                displayNo: 'REQ-HISTORY-1',
                applicantId: '00000000-0000-4000-8000-000000000007',
                projectName: '项目乙',
                projectId: '00000000-0000-4000-8000-000000000005',
                site: '乙工地',
                workflowStatus: historicalStatus,
                procurementMode: 'owner_self_purchase',
                orderDate: '2026-10-13',
                deliveryAddress: '乙工地',
                expectedDeliveryDate: null,
                notes: '详情备注',
                primaryCurrency: 'XOF',
                totalMinor: '1200',
                lines: [
                  {
                    materialName: '测试电缆',
                    model: 'FX-01',
                    specification: '3×2.5',
                    quantity: '1',
                    unit: '米',
                    currency: 'XOF',
                    unitPriceMinor: '1200',
                    lineTotalMinor: '1200',
                  },
                ],
                attachments: [],
                audits: [
                  {
                    id: '00000000-0000-4000-8000-000000000011',
                    orderId: '00000000-0000-4000-8000-000000000009',
                    actorId: '00000000-0000-4000-8000-000000000007',
                    action: 'confirmed',
                    reason: null,
                    previousJson: null,
                    nextJson: null,
                    createdAt: 1,
                  },
                ],
              })
            if (command === 'save_requisition_draft')
              return Promise.resolve({ totalMinor: '0' })
            if (
              command === 'list_order_comments' ||
              command === 'list_order_audits'
            )
              return Promise.resolve([])
            if (command === 'confirm_requisition') {
              historicalStatus = 'confirmed'
              return Promise.resolve()
            }
            if (command === 'issue_owner_formal_order') {
              Object.assign(window, { issuedOrderId: args?.orderId })
              historicalStatus = 'formally_issued'
              return Promise.resolve({
                documentType: 'OPA',
                formalDocumentNo: 'TEST-OPA-20261013-OPA-ABCDEFGH-1',
              })
            }
            if (command === 'withdraw_requisition') {
              historicalStatus = 'draft'
              return Promise.resolve()
            }
            return Promise.reject(new Error(`unexpected command: ${command}`))
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '获取验证码' }).click()
  await page.getByLabel('账号').fill('fixture')
  await page.getByLabel('密码').fill('fixture-password')
  await page.getByLabel(/本地验证码/).fill('2')
  await page.getByRole('button', { name: '离线登录' }).click()
  await page
    .getByLabel('当前授权范围')
    .selectOption(
      '00000000-0000-4000-8000-000000000005:00000000-0000-4000-8000-000000000003:00000000-0000-4000-8000-000000000006',
    )
  await expect(page.getByLabel('当前授权范围')).toHaveValue(
    '00000000-0000-4000-8000-000000000005:00000000-0000-4000-8000-000000000003:00000000-0000-4000-8000-000000000006',
  )
  await page.getByRole('button', { name: '采购申请单' }).click()
  await expect(page.locator('.page-heading p')).toContainText('乙工地')
  await expect(page.getByRole('list', { name: '请购历史' })).toContainText(
    'REQ-HISTORY-1',
  )
  await page.getByRole('button', { name: '查看详情：REQ-HISTORY-1' }).click()
  await expect(page.getByRole('region', { name: '请购详情' })).toContainText(
    '测试电缆',
  )
  await expect(page.getByRole('region', { name: '请购详情' })).toContainText(
    'pending_confirmation',
  )
  await page.getByRole('button', { name: '确认订单' }).click()
  await expect(page.getByRole('region', { name: '请购详情' })).toContainText(
    'confirmed',
  )
  await page.getByRole('button', { name: '正式下达业主申请' }).click()
  await expect(page.getByRole('region', { name: '请购详情' })).toContainText(
    'formally_issued',
  )
  await expect(
    page.evaluate(
      () => (window as Window & { issuedOrderId?: string }).issuedOrderId,
    ),
  ).resolves.toBe('00000000-0000-4000-8000-000000000009')
  const originalDraftNo = await page.locator('.page-heading p').textContent()
  page.once('dialog', (dialog) => void dialog.dismiss())
  await page.getByRole('button', { name: '复制为新草稿' }).click()
  await expect(page.locator('.page-heading p')).toHaveText(
    originalDraftNo ?? '',
  )
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: '复制为新草稿' }).click()
  await expect(page.getByText(/已复制材料和数量到未保存的新草稿/)).toBeVisible()
  await expect(page.getByLabel('税率（基点）')).toHaveValue('0')
  await expect(page.getByLabel('单价（最小货币单位）')).toHaveValue('0')
  await expect(page.getByText(/历史材料：测试电缆/)).toBeVisible()
  await page.evaluate(() => {
    ;(
      window as Window & { __setHistoryPending?: () => void }
    ).__setHistoryPending?.()
  })
  await page.getByRole('button', { name: '查看详情：REQ-HISTORY-1' }).click()
  await page.getByRole('button', { name: '撤回历史申请' }).click()
  await expect(page.getByRole('region', { name: '请购详情' })).toContainText(
    'draft',
  )
  await page.getByLabel('搜索单号、项目或工地').fill('不存在')
  await page.getByRole('button', { name: '筛选' }).click()
  await expect(page.getByText('暂无请购记录。')).toBeVisible()
  await expect(browserErrors).toEqual([])
})

test('administrator queries and changes cloud-scoped bindings from desktop UI', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const accountId = '00000000-0000-4000-8000-000000000010'
    let bindings = [
      {
        projectId: '00000000-0000-4000-8000-000000000002',
        departmentId: '00000000-0000-4000-8000-000000000003',
        teamId: '00000000-0000-4000-8000-000000000004',
        site: '甲工地',
      },
    ]
    Object.assign(window, {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              accountId?: string
              binding?: (typeof bindings)[number]
              replacement?: { newScope: (typeof bindings)[number] }
              revoke?: boolean
            },
          ) {
            if (command === 'issue_local_captcha')
              return Promise.resolve({
                id: crypto.randomUUID(),
                question: '1 + 1 = ?',
              })
            if (command === 'issue_cloud_captcha')
              return Promise.reject(new Error('offline'))
            if (command === 'offline_login')
              return Promise.resolve({
                user_id: accountId,
                username: 'admin',
                roles: ['administrator'],
                requires_password_change: false,
              })
            if (command === 'list_authorization_contexts')
              return Promise.resolve([])
            if (command === 'get_authorization_context')
              return Promise.reject(new Error('no local scope'))
            if (command === 'list_managed_authorizations')
              return Promise.resolve(bindings)
            if (
              command === 'replace_managed_authorization' &&
              args?.replacement
            ) {
              bindings = [{ ...args.replacement.newScope, site: '乙工地' }]
              return Promise.resolve()
            }
            if (command === 'change_managed_authorization' && args?.binding) {
              bindings = args.revoke
                ? []
                : [{ ...args.binding, site: '甲工地' }]
              return Promise.resolve()
            }
            return Promise.reject(new Error(`unexpected command: ${command}`))
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '获取验证码' }).click()
  await page.getByLabel('账号').fill('admin')
  await page.getByLabel('密码').fill('fixture-password')
  await page.getByLabel(/本地验证码/).fill('2')
  await page.getByRole('button', { name: '离线登录' }).click()
  await page.getByRole('button', { name: '在线授权管理' }).click()
  await page
    .getByLabel('账户 UUID')
    .fill('00000000-0000-4000-8000-000000000010')
  await page.getByRole('button', { name: '查询云端授权' }).click()
  await expect(page.getByText('已读取 1 个云端授权范围。')).toBeVisible()
  await page.getByRole('button', { name: '修改' }).click()
  await page
    .getByLabel('班组 UUID')
    .fill('00000000-0000-4000-8000-000000000005')
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByText('授权范围已原子修改。')).toBeVisible()
  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByText('授权已撤销。')).toBeVisible()
})

test('catalog details and Honsen draft can reach later quote pages', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const prices = Array.from({ length: 26 }, (_, i) => ({
      priceId: `p-${i}`,
      supplierId: `s-${i}`,
      supplierName: `Vendor ${i}`,
      isPreferredSupplier: false,
      currency: 'XOF',
      unitPriceMinor: String(1000 + i),
      unit: '件',
      effectiveAt: '2026-10-12',
    }))
    const material = {
      id: '00000000-0000-4000-8000-000000000901',
      sku: null,
      nameZh: '分页材料',
      nameFr: null,
      aliases: [],
      brand: null,
      model: 'PAGE',
      specification: 'fixture',
      unit: '件',
      notes: null,
      version: 1,
      prices: prices.slice(0, 4),
    }
    Object.assign(window, {
      __TAURI__: {
        core: {
          invoke(
            command: string,
            args?: {
              after?: string | null
              projectId?: string
              draft?: unknown
            },
          ) {
            if (command === 'search_catalog') return Promise.resolve([material])
            if (command === 'list_catalog_prices') {
              Object.assign(window, { __pagedProject: args?.projectId })
              return Promise.resolve(
                prices.slice(
                  args?.after ? Number(args.after.split('-').at(-1)) + 1 : 0,
                  args?.after ? Number(args.after.split('-').at(-1)) + 26 : 25,
                ),
              )
            }
            if (command === 'get_material_square_image')
              return Promise.resolve(null)
            if (command === 'save_requisition_draft') {
              Object.assign(window, { __pagedDraft: args?.draft })
              return Promise.resolve({ totalMinor: '0' })
            }
            return Promise.resolve()
          },
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '打开界面预览' }).click()
  await page.getByRole('button', { name: '材料库', exact: true }).click()
  await page.getByRole('button', { name: '查看全部报价' }).click()
  await expect(page.getByText(/Vendor 0 ·/)).toBeVisible()
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.getByText(/Vendor 25 ·/)).toBeVisible()
  await page.getByRole('button', { name: '上一页' }).click()
  await expect(page.getByText(/Vendor 0 ·/)).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: '采购申请单' }).click()
  await page.getByLabel('材料').click()
  await page.getByText('分页材料 · PAGE', { exact: true }).click()
  await page.getByRole('button', { name: '加载更多报价' }).click()
  await page.getByLabel('选择供应商报价').click()
  await page.getByText(/Vendor 25 ·/).click()
  await expect(page.getByLabel('单价（最小货币单位）')).toHaveValue('1025')
  await page.getByLabel('数量').fill('3')
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(
    page.evaluate(
      () =>
        (
          window as Window & {
            __pagedDraft?: {
              lines: Array<{
                supplierId: string
                quantity: string
                unitPriceMinor: string
                currency: string
              }>
            }
          }
        ).__pagedDraft?.lines[0],
    ),
  ).resolves.toMatchObject({
    supplierId: 's-25',
    catalogPriceId: 'p-25',
    priceSource: 'catalog',
    quantity: '3',
    unitPriceMinor: '1025',
    currency: 'XOF',
  })
  await expect(
    page.evaluate(
      () => (window as Window & { __pagedProject?: string }).__pagedProject,
    ),
  ).resolves.toBe('00000000-0000-4000-8000-000000000102')
})
