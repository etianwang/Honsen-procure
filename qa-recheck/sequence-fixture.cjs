const fs = require('node:fs')
const policyPath = 'deploy/linux/api-grant-policy.json'
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'))
policy['007_qa_sequence.sql'] = [
  { kind: 'table', name: 'qa_sequence_items', privileges: ['SELECT', 'INSERT'] },
  { kind: 'sequence', name: 'qa_sequence_items_id_seq', privileges: ['USAGE'] },
]
fs.writeFileSync(policyPath, JSON.stringify(policy, null, 2) + '\n')
fs.writeFileSync('apps/server/migrations/007_qa_sequence.sql', `CREATE TABLE qa_sequence_items (id BIGSERIAL PRIMARY KEY, note TEXT NOT NULL);\n`)
