import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
assert.equal(process.env.HONSEN_DEPLOY_TEST, '1')
const s = JSON.parse(readFileSync('/evidence/business-state.json', 'utf8')),
  o = JSON.parse(readFileSync('/evidence/cos-owned-state.json', 'utf8')),
  require = createRequire(resolve('apps/server/package.json')),
  { Pool } = require('pg'),
  argon2 = require('argon2'),
  db = new Pool({
    connectionString: readFileSync('/evidence/owner-url', 'utf8'),
  })
const reader = '10000000-0000-4000-8000-000000000011',
  username = 'native-restore-a',
  password = randomBytes(24).toString('base64url')
try {
  assert.equal(
    (
      await db.query('SELECT 1 FROM users WHERE id=$1 OR username=$2', [
        reader,
        username,
      ])
    ).rowCount,
    0,
  )
  await db.query('BEGIN')
  await db.query(
    "INSERT INTO users(id,business_code,username,password_hash,ui_locale,is_enabled,requires_password_change) VALUES($1,'NATIVE-RESTORE-A',$2,$3,'zh-CN',true,false)",
    [reader, username, await argon2.hash(password)],
  )
  await db.query(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'purchaser')",
    [reader],
  )
  await db.query(
    'INSERT INTO user_project_bindings(user_id,project_id) VALUES($1,$2)',
    [reader, s.project],
  )
  await db.query(
    'INSERT INTO user_project_scope_bindings(user_id,project_id,department_id,team_id) VALUES($1,$2,$3,$4)',
    [reader, s.project, s.department, s.team],
  )
  await db.query('COMMIT')
  for (const e of s.expected)
    assert.deepEqual(
      (
        await db.query(
          "SELECT payload_json FROM sync_entities WHERE entity_type='purchase_order' AND entity_id=$1",
          [e.id],
        )
      ).rows[0]?.payload_json ??
        (
          await db.query(
            "SELECT payload_json FROM sync_entities WHERE entity_type='procurement_expenditure' AND entity_id=$1",
            [e.id],
          )
        ).rows[0]?.payload_json,
      e.payload,
    )
  const orders = s.expected
    .filter((e) => e.payload.documentType)
    .map((e) => ({
      id: e.id,
      fields: {
        document_type: e.payload.documentType,
        formal_document_no: e.payload.formalDocumentNo,
        formal_snapshot_json: e.payload.formalSnapshotJson,
        workflow_status: e.payload.workflowStatus,
        total_minor: e.payload.totalMinor,
        manual_stamp_duty_minor: e.payload.manualStampDutyMinor,
        tax_minor: e.payload.taxMinor,
        tax_rate_basis_points: e.payload.taxRateBasisPoints,
      },
      items: e.payload.lines.map((l) => ({
        id: l.id,
        fields: {
          unit_price_minor: l.unitPriceMinor,
          line_total_minor: l.lineTotalMinor,
          quantity: l.quantity,
          currency: l.currency,
        },
      })),
      ...(e.payload.documentType === 'HPA' ? { paidMinor: '0' } : {}),
    }))
  const payments = s.expected
    .filter(
      (e) => e.payload.status === 'recorded' || e.payload.status === 'reversed',
    )
    .map((e) => ({
      id: e.id,
      orderId: e.payload.orderId,
      amountMinor: e.payload.amountMinor,
      status: e.payload.status,
      correctsExpenditureId: e.payload.correctsExpenditureId ?? null,
    }))
  const config = {
    apiBaseUrl: 'https://127.0.0.1:3443',
    caPemPath:
      'H:\\Honsen\\Honsen-Procure\\.cache\\final-cos\\native-tls\\ca.pem',
    exeHash: '26d1e3173284dc9c5ba146e75be5e18dacf379929cfba39ac38c4febd38ba35b',
    applicationSource: 'f3e6af88e4da2cbcd2d6950ccf16007a235fe8ff',
    accounts: [
      { userId: reader, username, password },
      { userId: s.actor, username: s.username, password: s.password },
    ],
    orders,
    payments,
    attachments: o.objects.map((item, index) => ({
      id: item.id,
      checksum: item.checksum,
      byteLength: item.byteLength,
      contentType: ['application/pdf', 'image/heic', 'image/jpeg'][index],
      ...(item.sourceAttachmentId
        ? { sourceAttachmentId: item.sourceAttachmentId }
        : {}),
    })),
    prefix: o.prefix,
  }
  writeFileSync(
    '/evidence/native-handoff.json',
    JSON.stringify(config, null, 2),
    { mode: 0o600 },
  )
  writeFileSync(
    '/evidence/native-handoff-public.json',
    JSON.stringify(
      { ...config, accounts: config.accounts.map(({ password, ...a }) => a) },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      status: 'READY',
      accounts: 2,
      orders: orders.length,
      payments: payments.length,
      attachments: config.attachments.length,
      historyUnchanged: true,
      secretsLogged: false,
    }),
  )
} finally {
  await db.end()
}
