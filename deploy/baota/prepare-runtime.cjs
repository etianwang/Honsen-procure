const fs = require('node:fs')
const p = 'packages/shared/package.json'
const j = JSON.parse(fs.readFileSync(p))
j.exports = { '.': './dist/index.js' }
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
for (const path of [
  'apps/server/src',
  'packages/shared/src',
  'apps/server/dist/scripts/native-test-server.js',
])
  fs.rmSync(path, { recursive: true, force: true })
function clean(path) {
  for (const e of fs.readdirSync(path, { withFileTypes: true })) {
    const f = `${path}/${e.name}`
    if (e.isDirectory()) clean(f)
    else if (/\.test\.js$/.test(e.name)) fs.unlinkSync(f)
  }
}
clean('apps/server/dist')
clean('packages/shared/dist')
for (const name of fs.readdirSync('node_modules/argon2/prebuilds')) {
  if (name !== 'linux-x64')
    fs.rmSync(`node_modules/argon2/prebuilds/${name}`, {
      recursive: true,
      force: true,
    })
}
