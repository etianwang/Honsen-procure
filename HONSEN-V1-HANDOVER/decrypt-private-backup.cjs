const fs = require('node:fs'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict')
const [input, keyPath, output] = process.argv.slice(2)
if (!input || !keyPath || !output)
  throw new Error(
    'Usage: node decrypt-private-backup.cjs encrypted.aesgcm RECOVERY-KEY.txt output.zip (or --verify)',
  )
const bytes = fs.readFileSync(input),
  header = Buffer.from('HONSEN_PRIVATE_V1\n')
assert(
  bytes.subarray(0, header.length).equals(header),
  'Unknown encrypted backup format',
)
const key = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'base64')
assert.equal(key.length, 32, 'Invalid recovery key')
const nonce = bytes.subarray(header.length, header.length + 12),
  body = bytes.subarray(header.length + 12)
const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
decipher.setAuthTag(body.subarray(-16))
const plain = Buffer.concat([
  decipher.update(body.subarray(0, -16)),
  decipher.final(),
])
assert(plain.subarray(0, 2).equals(Buffer.from('PK')), 'Invalid ZIP payload')
if (output !== '--verify') fs.writeFileSync(output, plain, { flag: 'wx' })
console.log(
  JSON.stringify({
    authenticated: true,
    bytes: plain.length,
    sha256: crypto.createHash('sha256').update(plain).digest('hex'),
    output: output === '--verify' ? 'not written' : output,
  }),
)
