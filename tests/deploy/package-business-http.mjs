import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
assert.equal(process.env.HONSEN_DEPLOY_TEST, '1')
const base = new URL(process.env.TEST_API_BASE_URL ?? '')
assert(['localhost', '127.0.0.1', '::1'].includes(base.hostname))
const statePath = process.env.TEST_BUSINESS_STATE
assert(statePath, 'Explicit private state path required')
const require = createRequire(resolve('apps/server/package.json'))
const { Pool } = require('pg'),
  argon2 = require('argon2')
const installationId = randomUUID()
async function api(path, token, body) {
  const r = await fetch(`${base.href.replace(/\/$/, '')}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  assert.equal(
    r.status,
    200,
    `${path} status ${r.status}: ${await (r.status === 200 ? Promise.resolve('') : r.text())}`,
  )
  return r.json()
}
async function login(username, password) {
  const c = await api('/api/auth/captcha'),
    n = c.question.match(/\d+/g).map(Number)
  const r = await fetch(`${base.href.replace(/\/$/, '')}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-installation-id': installationId,
    },
    body: JSON.stringify({
      username,
      password,
      captchaId: c.id,
      captchaAnswer: String(n[0] + n[1]),
    }),
  })
  assert.equal(r.status, 200)
  return (await r.json()).accessToken
}
async function pull(token) {
  let cursor = '0',
    changes = []
  for (let i = 0; i < 100; i++) {
    const p = await api(`/api/sync/pull?cursor=${cursor}&limit=500`, token)
    changes.push(...p.changes)
    if (p.nextCursor === cursor || p.changes.length === 0) return changes
    cursor = p.nextCursor
  }
  throw Error('Pull pagination exceeded bound')
}
if (process.env.TEST_BUSINESS_MODE === 'verify') {
  const s = JSON.parse(readFileSync(statePath, 'utf8')),
    token = await login(s.username, s.password),
    rows = await pull(token)
  for (const e of s.expected)
    assert.deepEqual(
      rows.filter((x) => x.entityId === e.id).at(-1)?.payload,
      e.payload,
      `Restart preserved ${e.id}`,
    )
  console.log(
    JSON.stringify({
      status: 'PASS',
      scope:
        'actual restarted API Pull preserves formal OPA/HPA/SPO and payment/reversal payloads',
      records: s.expected.length,
    }),
  )
} else {
  const u = new URL(process.env.TEST_DATABASE_URL ?? '')
  assert(
    u.pathname.toLowerCase().includes('test'),
    'Disposable database name required',
  )
  const db = new Pool({ connectionString: u.href }),
    password = randomBytes(24).toString('base64url')
  const actor = randomUUID(),
    engineer = randomUUID(),
    country = randomUUID(),
    project = randomUUID(),
    department = randomUUID(),
    team = randomUUID()
  const countryCode = `TC${country.slice(0, 8)}`,
    projectCode = `TP${project.slice(0, 8)}`,
    username = `test-${actor}`,
    engineerName = `test-${engineer}`
  try {
    const hash = await argon2.hash(password)
    for (const [id, name, role] of [
      [actor, username, 'purchaser'],
      [engineer, engineerName, 'engineer'],
    ]) {
      await db.query(
        "INSERT INTO users(id,business_code,username,password_hash,ui_locale,is_enabled,requires_password_change) VALUES($1,$2,$2,$3,'zh-CN',true,false)",
        [id, name, hash],
      )
      await db.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)', [
        id,
        role,
      ])
    }
    await db.query(
      "INSERT INTO countries(id,business_code,name,time_zone) VALUES($1,$2,'Synthetic test country','UTC')",
      [country, countryCode],
    )
    await db.query(
      "INSERT INTO projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair) VALUES($1,$2,$3,'Synthetic project','','','XOF','zh_fr')",
      [project, country, projectCode],
    )
    await db.query(
      "INSERT INTO departments(id,business_code,name) VALUES($1,$2,'Synthetic')",
      [department, `TD${department}`],
    )
    await db.query(
      "INSERT INTO teams(id,department_id,business_code,name) VALUES($1,$2,$3,'Synthetic')",
      [team, department, `TT${team}`],
    )
    for (const id of [actor, engineer]) {
      await db.query(
        'INSERT INTO user_project_bindings(user_id,project_id) VALUES($1,$2)',
        [id, project],
      )
      await db.query(
        'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES($1,$2,$3,$4)',
        [id, project, department, team],
      )
    }
  } finally {
    await db.end()
  }
  const token = await login(username, password),
    engToken = await login(engineerName, password)
  const expected = []
  const event = (id, payload, version = 0, type = 'purchase_order') => ({
    eventId: randomUUID(),
    entityId: id,
    entityType: type,
    operation: 'upsert',
    baseVersion: version,
    payload,
  })
  async function push(e, t = token, status = 'accepted') {
    const r = await api('/api/sync/push', t, {
      deviceId: installationId,
      events: [e],
    })
    assert.equal(r.results[0].status, status, JSON.stringify(r))
    return r.results[0]
  }
  let bits = BigInt(`0x${installationId.replaceAll('-', '')}`),
    short = ''
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  for (let i = 0; i < 8; i++) {
    short = alphabet[Number(bits & 31n)] + short
    bits >>= 5n
  }
  const common = {
    countryId: country,
    projectId: project,
    departmentId: department,
    teamId: team,
    applicantId: engineer,
    parentOrderId: null,
    procurementMode: 'honsen_self_purchase',
    workflowStatus: 'approved',
    confirmedBy: actor,
    confirmedAt: 1792022400,
    selfApproved: false,
    primaryCurrency: 'XOF',
    orderDate: '2026-10-15',
    lines: [
      {
        id: randomUUID(),
        currency: 'XOF',
        quantity: '2',
        unit: 'pcs',
        unitPriceMinor: '1250',
        lineTotalMinor: '2500',
        priceSource: 'manual',
      },
    ],
  }
  async function approved(id, payload) {
    await push(
      event(id, {
        ...payload,
        workflowStatus: 'pending_confirmation',
        confirmedBy: null,
        confirmedAt: null,
      }),
      engToken,
    )
    await push(event(id, payload, 1))
  }
  function formal(payload, type, sequence) {
    return {
      ...payload,
      workflowStatus:
        type === 'OPA'
          ? 'formally_issued'
          : type === 'SPO'
            ? 'sent'
            : 'executing',
      documentType: type,
      formalDocumentNo: `${countryCode}-${projectCode}-20261015-${type}-${short}-${sequence}`,
      formalInstallationId: installationId,
      formalSequence: String(sequence),
      formallyIssuedAt: 1792022401,
      formalSnapshotJson: JSON.stringify(payload),
    }
  }
  const parent = randomUUID()
  await approved(parent, common)
  const hpa = formal(common, 'HPA', 1),
    hpaEvent = event(parent, hpa, 2)
  await push(hpaEvent)
  await push(hpaEvent)
  expected.push({ id: parent, payload: hpa })
  await push(event(parent, { ...hpa, totalMinor: '999' }, 3), token, 'conflict')
  const supplier = randomUUID()
  await push(
    event(
      supplier,
      {
        id: supplier,
        countryId: country,
        businessCode: `SUP-${supplier}`,
        name: 'Synthetic supplier',
        contactName: null,
        address: null,
        city: null,
        country: null,
        phone: null,
        whatsapp: null,
        email: null,
        paymentTerms: null,
        deliveryLeadTime: null,
        isPreferred: false,
        isBlacklisted: false,
        isActive: true,
        version: 1,
      },
      0,
      'supplier',
    ),
  )
  const child = randomUUID(),
    draft = {
      ...common,
      parentOrderId: parent,
      procurementMode: null,
      workflowStatus: 'draft',
      confirmedBy: null,
      confirmedAt: null,
      supplierId: supplier,
      supplierSnapshotJson: JSON.stringify({ name: 'Synthetic supplier' }),
      supplierTermsCompletedAt: 1792022400,
      currency: 'XOF',
      lockedExchangeRateDecimal: '1',
    }
  await push(event(child, draft))
  const spo = formal(draft, 'SPO', 2)
  await push(event(child, spo, 1))
  expected.push({ id: child, payload: spo })
  const owner = randomUUID(),
    opaBase = {
      ...common,
      procurementMode: 'owner_self_purchase',
      totalMinor: '252',
      taxRateBasisPoints: 500, // Synthetic arithmetic fixture, never a statutory rate.
      orderDiscountJson: '{"kind":"fixed_minor","minor":"0"}',
      orderFreightJson: '{"kind":"fixed_minor","minor":"0"}',
      lines: [
        {
          id: randomUUID(),
          currency: 'XOF',
          ownerQuoteSource: 'manual_reference',
          ownerCatalogPriceId: null,
          ownerManualReferenceReason: 'Synthetic test',
          ownerManualReferenceActorId: actor,
          ownerManualReferenceAt: 1792022400,
          ownerSourceUnitPriceMinor: '100',
          ownerLockedExchangeRateDecimal: '1',
          ownerConvertedReferenceUnitMinor: '100',
          ownerMarkupJson: '{"kind":"fixed_minor","minor":"20"}',
          ownerFinalUnitPriceMinor: '120',
          quantity: '2',
          lineDiscountJson: '{"kind":"fixed_minor","minor":"0"}',
          lineFreightJson: '{"kind":"fixed_minor","minor":"0"}',
          freightIncluded: false,
        },
      ],
    }
  opaBase.ownerPrintTotalsJson = JSON.stringify({
    version: 1,
    currency: 'XOF',
    lines: [
      {
        id: opaBase.lines[0].id,
        subtotalMinor: '240',
        discountMinor: '0',
        freightMinor: '0',
        totalMinor: '240',
      },
    ],
    subtotalMinor: '240',
    lineDiscountMinor: '0',
    orderDiscountMinor: '0',
    freightMinor: '0',
    taxMinor: '12',
    totalMinor: '252',
  })
  const ownerApproval = { ...opaBase }
  delete ownerApproval.ownerPrintTotalsJson
  await approved(owner, ownerApproval)
  const opa = formal(opaBase, 'OPA', 3)
  await push(event(owner, opa, 2))
  expected.push({ id: owner, payload: opa })
  const payId = randomUUID(),
    pay = {
      id: payId,
      orderId: child,
      projectId: project,
      countryId: country,
      payeeName: 'Synthetic',
      currency: 'XOF',
      amountMinor: '100',
      paymentDate: '2026-10-24',
      paymentType: 'progress',
      paymentMethod: 'cash',
      paymentHandlerId: actor,
      createdBy: actor,
      status: 'recorded',
      createdAt: 1792800000,
    }
  const paymentEvent = event(payId, pay, 0, 'procurement_expenditure')
  await push(paymentEvent)
  await push(paymentEvent)
  expected.push({ id: payId, payload: pay })
  const reverseId = randomUUID(),
    reverse = {
      ...pay,
      id: reverseId,
      status: 'reversed',
      correctsExpenditureId: payId,
      correctionReason: 'Synthetic correction',
      createdAt: 1792800001,
    }
  await push(event(reverseId, reverse, 0, 'procurement_expenditure'))
  expected.push({ id: reverseId, payload: reverse })
  await push(
    event(randomUUID(), {
      ...common,
      projectId: randomUUID(),
      workflowStatus: 'draft',
      confirmedBy: null,
      confirmedAt: null,
    }),
    engToken,
    'validation_error',
  )
  await push(
    event(randomUUID(), pay, 0, 'procurement_expenditure'),
    engToken,
    'validation_error',
  )
  const rows = await pull(token)
  for (const e of expected)
    assert.deepEqual(
      rows.filter((x) => x.entityId === e.id).at(-1)?.payload,
      e.payload,
    )
  writeFileSync(
    statePath,
    JSON.stringify({
      username,
      engineerName,
      actor,
      engineer,
      project,
      department,
      team,
      password,
      expected,
    }),
    {
      mode: 0o600,
    },
  )
  console.log(
    JSON.stringify({
      status: 'PASS',
      scope:
        'actual HTTP nonempty Push/Pull OPA/HPA/SPO/payment/reversal, idempotent replay, frozen conflict and engineer project/payment denial',
      records: expected.length,
      secretsLogged: false,
    }),
  )
}
