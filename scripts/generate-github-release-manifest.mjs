import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const [installer, outputDirectory] = process.argv.slice(2)
const version = process.env.HONSEN_RELEASE_VERSION
const expectedName = `Honsen-Procure-${version}-Setup.exe`

if (
  !installer ||
  !outputDirectory ||
  !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version ?? '')
) {
  throw new Error(
    'installer, output directory, and HONSEN_RELEASE_VERSION are required',
  )
}
if (basename(installer) !== expectedName) {
  throw new Error(`installer must be named ${expectedName}`)
}

const sha256 = createHash('sha256')
  .update(readFileSync(installer))
  .digest('hex')
const installerUrl = `https://github.com/etianwang/Honsen-procure/releases/download/v${version}/${expectedName}`
mkdirSync(outputDirectory, { recursive: true })
writeFileSync(
  resolve(outputDirectory, 'manifest.json'),
  `${JSON.stringify({ appId: 'honsen.procure', version, installerUrl, sha256 }, null, 2)}\n`,
  'utf8',
)
