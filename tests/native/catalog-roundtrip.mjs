// Extension of the existing native formal-pull driver: every business mutation
// below uses production IPC. SQLite and PostgreSQL access is SELECT-only evidence.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export async function runCatalogRoundtrip({
  issuer,
  receiver,
  call,
  push,
  login,
  restartIssuer,
  readDb,
  pool,
  profiles,
  scope,
  runId,
  setPhase,
}) {
  const categoryId = randomUUID(),
    materialId = randomUUID(),
    supplierIds = [randomUUID(), randomUUID()]
  const marker = 'Synthetic catalog ' + runId
  const evidence = {
    materialId,
    supplierIds,
    businessWrites: 'PRODUCTION_TAURI_IPC_ONLY',
    databaseEvidence: 'READ_ONLY_SQL',
    scope: 'LOCAL_HTTPS_POSTGRES_NOT_REMOTE_STAGING',
  }
  const material = {
    id: materialId,
    nameZh: marker,
    nameFr: 'Matériau synthétique',
    nameEn: 'Synthetic catalog material',
    sku: null,
    categoryId,
    aliases: [],
    brand: null,
    model: 'SYNTH-M',
    specification: 'Synthetic specification',
    unit: 'pcs',
    notes: 'Synthetic material notes',
    isActive: true,
    version: 1,
  }
  const suppliers = supplierIds.map((id, index) => ({
    id,
    countryId: scope.countryId,
    businessCode: 'SYNTH-CATALOG-' + index + '-' + id.slice(0, 8),
    name: marker + ' supplier ' + index,
    contactName: 'Synthetic contact',
    address: 'Synthetic address',
    city: null,
    country: null,
    phone: null,
    whatsapp: null,
    email: null,
    paymentTerms: 'Synthetic terms',
    deliveryLeadTime: 'Synthetic lead time',
    notes: 'Synthetic supplier notes',
    isPreferred: index === 0,
    isBlacklisted: false,
    isActive: true,
    version: 1,
  }))
  const ownIds = [materialId, ...supplierIds]
  const cloud = async (id) =>
    (
      await pool.query(
        'SELECT payload_json FROM sync_entities WHERE entity_id=$1',
        [id],
      )
    ).rows[0]?.payload_json
  const pending = () =>
    readDb(
      profiles[1],
      'SELECT event_id,entity_type,entity_id,payload_json FROM local_sync_outbox WHERE acknowledged_at IS NULL AND superseded_at IS NULL ORDER BY rowid',
    )
  const deny = async (app, command, args) => {
    const result = await app.page.evaluate(
      async ({ command, args }) => {
        try {
          await window.__TAURI__.core.invoke(command, args)
          return null
        } catch (error) {
          return error?.code
        }
      },
      { command, args },
    )
    assert.equal(result, 'forbidden', command)
  }
  const search = (app, includeInactive = false) =>
    call(app, 'search_catalog', {
      query: marker,
      projectId: scope.projectId,
      includeInactive,
    })
  const history = async (app, supplierId) => {
    const rows = []
    let after = null
    for (;;) {
      const page = await call(app, 'list_supplier_prices', {
        supplierId,
        projectId: scope.projectId,
        after,
      })
      rows.push(...page)
      if (page.length < 25) return rows
      assert.notEqual(page.at(-1).priceId, after)
      after = page.at(-1).priceId
    }
  }
  const sync = async () => {
    await push(issuer)
    await call(receiver, 'pull_sync')
  }
  setPhase('catalog-native-create')
  await call(issuer, 'save_reference_master_data', {
    record: {
      kind: 'material_category',
      id: categoryId,
      business_code: 'SYNTH-CATEGORY-' + categoryId.slice(0, 8),
      name: 'Synthetic catalog category',
      is_active: true,
      version: 1,
    },
  })
  await call(issuer, 'save_material', { material })
  for (const supplier of suppliers)
    await call(issuer, 'save_supplier', { supplier })
  await deny(receiver, 'save_supplier', {
    supplier: { ...suppliers[0], id: randomUUID() },
  })
  await deny(issuer, 'save_supplier', {
    supplier: { ...suppliers[0], id: randomUUID(), countryId: randomUUID() },
  })
  const prices = [
    { supplierId: supplierIds[0], currency: 'XOF', unitPriceMinor: '125' },
    { supplierId: supplierIds[1], currency: 'XOF', unitPriceMinor: '150' },
    { supplierId: supplierIds[0], currency: 'XAF', unitPriceMinor: '200' },
    {
      supplierId: supplierIds[0],
      currency: 'USD',
      unitPriceMinor: '9007199254740993',
    },
  ].map((price) => ({
    id: randomUUID(),
    materialId,
    ...price,
    unit: 'pcs',
    effectiveAt: '2026-11-07',
    sourceNote: 'Synthetic native quote',
    version: 1,
  }))
  for (const price of prices)
    await call(issuer, 'add_material_price', { price })
  ownIds.push(...prices.map((price) => price.id))
  const queued = pending()
  assert.ok(
    queued.filter((event) => ownIds.includes(event.entity_id)).length >= 7,
  )
  assert.equal(
    (
      await pool.query(
        'SELECT count(*)::int AS count FROM sync_entities WHERE entity_id=ANY($1::uuid[])',
        [ownIds],
      )
    ).rows[0].count,
    0,
  )
  setPhase('catalog-native-offline-restart')
  issuer = await restartIssuer(issuer)
  assert.deepEqual(pending(), queued)
  const captcha = await call(issuer, 'issue_local_captcha')
  const numbers = captcha.question.match(/\d+/g).map(Number)
  await call(issuer, 'offline_login', {
    request: {
      username: 'purchaser',
      password: process.env.HONSEN_TEST_PURCHASER_PASSWORD,
      captchaId: captcha.id,
      captchaAnswer: numbers[0] + numbers[1],
    },
  })
  await call(issuer, 'save_material', {
    material: {
      ...material,
      notes: 'Synthetic offline persisted edit',
      version: 2,
    },
  })
  assert.equal(await cloud(materialId), undefined)
  assert.ok(pending().length > queued.length)
  await login(issuer, 'purchaser', process.env.HONSEN_TEST_PURCHASER_PASSWORD)
  setPhase('catalog-native-push-pull')
  await sync()
  assert.equal(
    (await cloud(materialId)).notes,
    'Synthetic offline persisted edit',
  )
  assert.equal((await search(receiver))[0].id, materialId)
  assert.equal((await search(receiver))[0].categoryId, categoryId)
  assert.equal((await search(receiver))[0].isActive, true)
  const allQuotes = await call(receiver, 'list_catalog_prices', {
    materialId,
    projectId: scope.projectId,
    after: null,
    includeBlacklisted: true,
  })
  assert.equal(allQuotes.length, 4)
  assert.equal(
    allQuotes.find((price) => price.currency === 'USD').unitPriceMinor,
    '9007199254740993',
  )
  assert.deepEqual(
    allQuotes
      .filter((price) => price.currency === 'XOF')
      .map((price) => price.supplierId)
      .sort(),
    [...supplierIds].sort(),
  )
  const replay = await call(issuer, 'push_pending_sync')
  assert.equal(replay.acceptedCount, 0)
  assert.equal(replay.pendingCount, 0)
  setPhase('catalog-native-append-history-and-notes')
  const replacement = {
    ...prices[0],
    id: randomUUID(),
    unitPriceMinor: '175',
    sourceNote: 'Synthetic replacement quote',
  }
  await call(issuer, 'add_material_price', { price: replacement })
  await call(issuer, 'save_supplier', {
    supplier: {
      ...suppliers[0],
      contactName: 'Synthetic changed contact',
      address: 'Synthetic changed address',
      notes: 'Synthetic changed supplier notes',
      version: 2,
    },
  })
  await sync()
  const rows = await history(receiver, supplierIds[0])
  assert.equal(rows.length, 4)
  assert.equal(
    rows.find((price) => price.priceId === prices[0].id).isActive,
    false,
  )
  assert.equal(
    rows.find((price) => price.priceId === replacement.id).isActive,
    true,
  )
  const changed = (await call(receiver, 'list_suppliers')).find(
    (row) => row.id === supplierIds[0],
  )
  assert.equal(changed.notes, 'Synthetic changed supplier notes')
  assert.equal(changed.contactName, 'Synthetic changed contact')
  assert.equal(changed.address, 'Synthetic changed address')
  const omitted = { ...suppliers[0], version: 3 }
  delete omitted.notes
  await call(issuer, 'save_supplier', { supplier: omitted })
  await sync()
  assert.equal(
    (await cloud(supplierIds[0])).notes,
    'Synthetic changed supplier notes',
  )
  assert.equal(
    (await call(receiver, 'list_suppliers')).find(
      (row) => row.id === supplierIds[0],
    ).notes,
    'Synthetic changed supplier notes',
  )
  await call(issuer, 'save_supplier', {
    supplier: { ...suppliers[0], notes: null, version: 4 },
  })
  await sync()
  assert.equal((await cloud(supplierIds[0])).notes, null)
  assert.equal(
    (await call(receiver, 'list_suppliers')).find(
      (row) => row.id === supplierIds[0],
    ).notes,
    null,
  )
  setPhase('catalog-native-deactivate-reactivate')
  await call(issuer, 'save_material', {
    material: { ...material, isActive: false, version: 3 },
  })
  await sync()
  assert.deepEqual(await search(receiver), [])
  assert.equal((await search(issuer, true))[0].isActive, false)
  await deny(receiver, 'search_catalog', {
    query: marker,
    projectId: scope.projectId,
    includeInactive: true,
  })
  await call(issuer, 'save_material', {
    material: { ...material, isActive: true, version: 4 },
  })
  await call(issuer, 'save_supplier', {
    supplier: { ...suppliers[0], isActive: false, notes: null, version: 5 },
  })
  await sync()
  assert.equal((await search(receiver))[0].id, materialId)
  assert.equal((await search(receiver))[0].categoryId, categoryId)
  assert.equal(
    (await call(receiver, 'list_suppliers')).find(
      (row) => row.id === supplierIds[0],
    ).isActive,
    false,
  )
  assert.equal(
    (
      await call(receiver, 'list_catalog_prices', {
        materialId,
        projectId: scope.projectId,
        after: null,
        includeBlacklisted: true,
      })
    ).some((price) => price.supplierId === supplierIds[0]),
    false,
  )
  assert.equal((await history(receiver, supplierIds[0])).length, 4)
  await call(issuer, 'save_supplier', {
    supplier: { ...suppliers[0], notes: null, version: 6 },
  })
  await sync()
  assert.equal(
    (await call(receiver, 'list_suppliers')).find(
      (row) => row.id === supplierIds[0],
    ).isActive,
    true,
  )
  assert.equal((await cloud(supplierIds[0])).isActive, true)
  assert.equal(
    readDb(
      profiles[1],
      'SELECT count(*) AS count FROM local_suppliers WHERE id=?',
      supplierIds[0],
    )[0].count,
    1,
  )
  evidence.results = [
    'IPC_CREATE_EDIT_MULTI_SUPPLIER_MULTI_CURRENCY',
    'OFFLINE_LOGIN_WRITE_RESTART_PENDING_RETAINED',
    'HTTPS_PUSH_POSTGRES_ACK_SECOND_SQLITE_PULL',
    'INTEGER_MINOR_ABOVE_JS_SAFE_INTEGER_PRESERVED',
    'APPENDED_HISTORY_REPLACEMENT_PRESERVED',
    'NOTES_OMISSION_PRESERVED_EXPLICIT_NULL_CLEARED',
    'ROLE_COUNTRY_DENIAL',
    'MATERIAL_AND_SUPPLIER_DEACTIVATE_REACTIVATE',
    'REPEATED_SYNC_NO_DUPLICATE',
  ]
  return { issuer, evidence }
}
