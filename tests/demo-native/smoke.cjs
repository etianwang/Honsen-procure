const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { once } = require('node:events')
const { expect } = require('../../node_modules/@playwright/test')
const demo = require('./session.cjs')
;(async () => {
  const consoleErrors = []
  try {
    await demo.start()
    const page = demo.state.page
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    const unauthorized = await page.evaluate(async () => {
      try {
        await window.__TAURI__.core.invoke('list_suppliers')
        return false
      } catch (e) {
        return e.code === 'reauthentication_required'
      }
    })
    assert(unauthorized, 'unauthenticated reads must remain denied')
    await demo.login('张和凯')
    await demo.seed()
    await page.getByRole('button', { name: '锁定', exact: true }).click()
    await demo.login('沈奕文')
    await demo.nav('采购申请单')
    await page.getByRole('combobox', { name: '材料', exact: true }).click()
    await page
      .getByText('PVC 排水管 DN110 · PVC-DN110', { exact: true })
      .filter({ visible: true })
      .click()
    await page.getByLabel('数量', { exact: true }).fill('1')
    await page.getByRole('button', { name: '提交确认', exact: true }).click()
    await expect(page.getByLabel('审批状态').first()).toHaveText('待确认')
    const history = await demo.call('list_requisition_history', {
      cursor: null,
      filter: null,
    })
    assert.equal(history.records.length, 1)
    const order = history.records[0]
    const selfApproval = await page.evaluate(async (orderId) => {
      try {
        await window.__TAURI__.core.invoke('confirm_requisition', { orderId })
        return false
      } catch (e) {
        return e.code === 'forbidden'
      }
    }, order.id)
    assert(selfApproval, 'purchaser self approval must remain denied')
    await page.getByRole('button', { name: '锁定', exact: true }).click()
    await demo.login('张和凯')
    await demo.nav('采购申请单')
    await page
      .getByRole('button', {
        name: '查看详情：' + order.displayNo,
        exact: true,
      })
      .click()
    await page
      .getByLabel('请购详情', { exact: true })
      .getByRole('button', { name: '确认订单', exact: true })
      .click()
    await expect(
      page.getByLabel('请购详情', { exact: true }).getByLabel('审批状态'),
    ).toHaveText('已确认')
    const detail = await demo.call('get_requisition_detail', {
      orderId: order.id,
    })
    assert.equal(detail.applicantId, demo.id(13))
    assert.equal(detail.totalMinor, '1250')
    assert(
      detail.audits.some(
        (a) => a.action === 'confirmed' && a.actorId === demo.id(11),
      ),
    )
    assert.deepEqual(demo.state.errors, [])
    assert.deepEqual(consoleErrors, [])
    await demo.capture(
      'smoke-approval.png',
      'Fresh isolated actual DOM create-submit-deny-self-approve-by-admin proof',
    )
    fs.writeFileSync(
      path.join(process.env.HONSEN_DEMO_RUNTIME, 'smoke-result.json'),
      JSON.stringify(
        {
          status: 'PASS',
          unauthenticatedDenied: true,
          selfApprovalDenied: true,
          namedRoleApproval: true,
          totalMinor: detail.totalMinor,
          consoleErrors,
          pageErrors: demo.state.errors,
        },
        null,
        2,
      ),
    )
    console.log(
      'PASS: real Tauri DOM workflow; unauthenticated/self-approval denied; purchaser13 -> admin11; no console/page errors.',
    )
  } finally {
    if (demo.state.browser) await demo.state.browser.close()
    if (demo.state.child && demo.state.child.exitCode === null) {
      const exited = once(demo.state.child, 'exit')
      demo.state.child.kill()
      await exited
    }
  }
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
