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
for (const name of fs.readdirSync('apps/server/dist/scripts')) {
  if (name.startsWith('native-'))
    fs.rmSync('apps/server/dist/scripts/' + name, {
      recursive: true,
      force: true,
    })
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

function removePackageFixtures(path) {
  for (const e of fs.readdirSync(path, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue
    const f = `${path}/${e.name}`
    if (e.isDirectory()) {
      if (
        [
          'test',
          'tests',
          '__tests__',
          'fixture',
          'fixtures',
          'benchmarks',
          'benchmark',
          'examples',
        ].includes(e.name)
      )
        fs.rmSync(f, { recursive: true, force: true })
      else removePackageFixtures(f)
    } else if (/\.(test|spec)\.[cm]?[jt]s$/.test(e.name)) fs.unlinkSync(f)
  }
}
removePackageFixtures('node_modules')
