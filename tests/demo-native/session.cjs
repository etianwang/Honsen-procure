const { chromium } = require('../../node_modules/playwright')
const fs = require('node:fs')
const cp = require('node:child_process')
const crypto = require('node:crypto')
const path = require('node:path')
const runtime = process.env.HONSEN_DEMO_RUNTIME
if (!runtime || !path.isAbsolute(runtime))
  throw Error('Absolute isolated HONSEN_DEMO_RUNTIME required')
const out = process.env.HONSEN_DEMO_OUTPUT
if (!out || !path.isAbsolute(out))
  throw Error('Absolute HONSEN_DEMO_OUTPUT required')
const password = crypto.randomBytes(24).toString('hex')
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const suppliers = [
  '演示供应商 A · 阿比让机电',
  '演示供应商 B · 象牙建材',
  '演示供应商 C · 海岸工程物资',
  '演示供应商 D · 绿洲材料',
]
const materials = [
  [
    'PVC 排水管 DN110',
    'PVC-DN110',
    'DN110 × 3.2 mm',
    '根',
    '1250',
    '100',
    'Tuyau PVC DN110',
  ],
  [
    '镀锌桥架 200×100 mm',
    'TRAY-200100',
    '200 × 100 × 1.2 mm',
    '米',
    '2500',
    '20',
    'Chemin de câbles galvanisé',
  ],
  [
    'LED 平板灯 600×600',
    'LED-6060',
    '36W / 600 × 600 mm',
    '套',
    '6500',
    '30',
    'Panneau LED 600×600',
  ],
  [
    '铜芯电缆 3×2.5 mm²',
    'CU-3X25',
    '3 × 2.5 mm² / 450V',
    '米',
    '750',
    '200',
    'Câble cuivre 3×2.5 mm²',
  ],
  [
    '给水阀门 DN50',
    'VALVE-DN50',
    'DN50 / PN16',
    '个',
    '9000',
    '10',
    'Vanne alimentation DN50',
  ],
  [
    '空调铜管及保温材料',
    'AC-CU-PAIR',
    '1/4 + 3/8 英寸配套保温',
    '米',
    '4500',
    '50',
    'Tube cuivre et isolation',
  ],
]
const state = { calls: [], shots: [], errors: [], actor: '未登录' }
function save() {
  fs.writeFileSync(
    path.join(runtime, 'recovery-evidence.json'),
    JSON.stringify(
      { calls: state.calls, shots: state.shots, errors: state.errors },
      null,
      2,
    ),
  )
}
async function start() {
  fs.mkdirSync(path.join(runtime, 'temp'), { recursive: true })
  const env = {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    USERPROFILE: process.env.USERPROFILE,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    APPDATA: process.env.APPDATA,
    TEMP: path.join(runtime, 'temp'),
    TMP: path.join(runtime, 'temp'),
    PATH: process.env.SystemRoot + '\\System32',
    HONSEN_DEMO_TEST_ONLY: '1',
    HONSEN_DEMO_PASSWORD: password,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
      '--remote-debugging-port=9368 --remote-debugging-address=127.0.0.1',
    WEBVIEW2_USER_DATA_FOLDER: path.join(runtime, 'webview'),
  }
  state.child = cp.spawn(
    path.join(runtime, 'cargo-target/release/honsen-demo-test-harness.exe'),
    [],
    { env, windowsHide: true },
  )
  state.child.stdout.on('data', (b) =>
    fs.appendFileSync(path.join(runtime, 'app.log'), b),
  )
  state.child.stderr.on('data', (b) =>
    fs.appendFileSync(path.join(runtime, 'app-error.log'), b),
  )
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await fetch('http://127.0.0.1:9368/json/version')
      break
    } catch {
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  state.browser = await chromium.connectOverCDP('http://127.0.0.1:9368')
  state.page = state.browser.contexts()[0].pages()[0]
  state.page.setDefaultTimeout(4500)
  await state.page.setViewportSize({ width: 1920, height: 1080 })
  state.page.on('pageerror', (e) => {
    state.errors.push(e.message)
    save()
  })
  await state.page
    .getByRole('heading', { name: '登录 HONSEN Procure' })
    .waitFor()
  return { pid: state.child.pid }
}
async function call(command, args = {}) {
  try {
    const value = await state.page.evaluate(
      ({ command, args }) => window.__TAURI__.core.invoke(command, args),
      { command, args },
    )
    state.calls.push({
      at: new Date().toISOString(),
      actor: state.actor,
      command,
      ok: true,
    })
    save()
    return value
  } catch (e) {
    state.calls.push({
      at: new Date().toISOString(),
      actor: state.actor,
      command,
      ok: false,
      error: String(e),
    })
    save()
    throw e
  }
}
async function login(name) {
  const p = state.page
  await p.getByLabel('账号', { exact: true }).fill(name)
  await p.getByLabel('密码', { exact: true }).fill(password)
  await p.getByRole('button', { name: /获取验证码|换一个验证码/ }).click()
  await p
    .locator('label[for=captcha]')
    .filter({ hasText: /[0-9]+ [+] [0-9]+/ })
    .waitFor()
  const text = await p.locator('label[for=captcha]').innerText()
  const m = text.match(/(\d+) \+ (\d+)/)
  if (!m) throw Error('Unexpected local test CAPTCHA')
  await p.locator('#captcha').fill(String(+m[1] + +m[2]))
  await p.getByRole('button', { name: '离线登录', exact: true }).click()
  await p.getByRole('button', { name: '首页', exact: true }).waitFor()
  state.actor = name
  await p.getByLabel('当前授权范围').waitFor()
  save()
}
async function nav(name) {
  await state.page.getByRole('button', { name, exact: true }).click()
  await state.page.evaluate(() => document.fonts.ready)
}
async function capture(file, description) {
  if (fs.existsSync(path.join(out, file)))
    throw Error('Never overwrite screenshot: ' + file)
  await state.page.evaluate(() => document.fonts.ready)
  await state.page.screenshot({ path: path.join(out, file) })
  state.shots.push({
    file,
    actor: state.actor,
    description,
    environment:
      '原生 Tauri 测试构建 / unchanged React and Rust core / SQLite :memory: / existing memory vault',
    url: state.page.url(),
    at: new Date().toISOString(),
    viewport: state.page.viewportSize(),
  })
  save()
}
async function seed() {
  for (let j = 0; j < 4; j++)
    await call('save_supplier', {
      supplier: {
        id: id(100 + j),
        businessCode: 'DEMO-S' + (j + 1),
        name: suppliers[j],
        countryId: id(1),
        contactName: '演示联系人 ' + String.fromCharCode(65 + j),
        address: '阿比让演示工业区 ' + (j + 1) + ' 号（虚构）',
        city: '阿比让',
        country: '科特迪瓦',
        phone: null,
        whatsapp: null,
        email: 'demo' + (j + 1) + '@example.invalid',
        paymentTerms: '预付款 30%，交货后结算',
        deliveryLeadTime: 3 + j + ' 个工作日',
        isPreferred: j === 0,
        isBlacklisted: false,
        isActive: true,
        version: 1,
      },
    })
  for (let i = 0; i < materials.length; i++) {
    const [name, model, spec, unit, price, , fr] = materials[i]
    await call('save_material', {
      material: {
        id: id(200 + i),
        sku: 'DEMO-M' + (i + 1),
        categoryId: null,
        nameZh: name,
        nameFr: fr,
        aliases: ['Bethel2', '演示材料'],
        brand: '演示规格',
        model,
        specification: spec,
        unit,
        notes: '仅供 Bethel2 办公楼演示；虚构材料及价格',
        isActive: true,
        version: 1,
      },
    })
    for (let j = 0; j < 4; j++)
      await call('add_material_price', {
        price: {
          id: id(300 + i * 4 + j),
          materialId: id(200 + i),
          supplierId: id(100 + j),
          currency: 'XOF',
          unitPriceMinor: String(BigInt(price) + BigInt(j) * 100n),
          unit,
          effectiveAt: '2026-10-25',
          sourceNote: '演示报价，非实际市场承诺',
          version: 1,
        },
      })
  }
}
module.exports = {
  state,
  id,
  suppliers,
  materials,
  start,
  call,
  login,
  nav,
  capture,
  seed,
  save,
}
