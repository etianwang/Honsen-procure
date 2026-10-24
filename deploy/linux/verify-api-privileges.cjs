// Check the same table, column, sequence and routine grants used during deployment.
async function verifyApiPrivileges(client, policy) {
  for (const entries of Object.values(policy)) {
    if (!Array.isArray(entries)) throw new Error('Invalid API grant policy')
    for (const entry of entries) {
      if (
        !/^[a-z_][a-z0-9_]*$/.test(entry.name || '') ||
        !Array.isArray(entry.privileges)
      )
        throw new Error('Invalid API grant policy')
      if (!['table', 'sequence', 'routine'].includes(entry.kind))
        throw new Error('Invalid API grant kind')
      if (
        entry.updateColumns !== undefined &&
        (entry.kind !== 'table' ||
          entry.name !== 'attachments' ||
          !entry.privileges.includes('UPDATE') ||
          JSON.stringify(entry.updateColumns) !==
            JSON.stringify(['status', 'version_id']))
      )
        throw new Error('Invalid API column grant')
      if (
        entry.kind === 'routine' &&
        ![
          'guard_category_business_code',
          'preserve_procurement_expenditure',
          'preserve_attachment_archive',
          'canonical_procurement_payment',
        ].includes(entry.name)
      )
        throw new Error('Invalid API routine grant')
      for (const privilege of entry.privileges) {
        let access
        if (entry.kind === 'routine') {
          if (
            entry.name !== 'canonical_procurement_payment' ||
            privilege !== 'EXECUTE'
          )
            throw new Error('Invalid API routine grant')
          access = await client.query(
            "SELECT has_function_privilege(current_user,to_regprocedure($1),'EXECUTE') AS allowed",
            [
              'public.canonical_procurement_payment(pg_catalog.jsonb,pg_catalog.uuid,pg_catalog.timestamptz)',
            ],
          )
        } else if (
          entry.kind === 'table' &&
          privilege === 'UPDATE' &&
          entry.updateColumns
        ) {
          access = await client.query(
            "SELECT bool_and(has_column_privilege(current_user,to_regclass($1),column_name,'UPDATE')) AS allowed FROM unnest($2::text[]) AS column_name",
            [`public.${entry.name}`, entry.updateColumns],
          )
        } else {
          const allowed =
            entry.kind === 'table'
              ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
              : ['USAGE', 'SELECT']
          if (!allowed.includes(privilege))
            throw new Error('Invalid API grant privilege')
          const fn =
            entry.kind === 'table'
              ? 'has_table_privilege'
              : 'has_sequence_privilege'
          access = await client.query(
            `SELECT ${fn}(current_user,to_regclass($1),$2) AS allowed`,
            [`public.${entry.name}`, privilege],
          )
        }
        if (!access.rows[0]?.allowed)
          throw new Error('API database privileges incomplete')
      }
    }
  }
}
module.exports = { verifyApiPrivileges }
