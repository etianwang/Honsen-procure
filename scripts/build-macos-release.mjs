import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertEmployeeExecutables } from './macos-bundle.mjs'

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('This candidate requires an Apple Silicon macOS build host')
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const expectedNode = readFileSync(join(root, '.nvmrc'), 'utf8').trim()
if (process.versions.node !== expectedNode) {
  throw new Error(`Use Node ${expectedNode} from .nvmrc`)
}
const desktop = join(root, 'apps', 'desktop')
const config = JSON.parse(
  readFileSync(join(desktop, 'src-tauri', 'tauri.macos.conf.json'), 'utf8'),
)
const target = resolve(
  desktop,
  'src-tauri',
  process.env.CARGO_TARGET_DIR ?? 'target',
)
execFileSync(
  process.execPath,
  [
    join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    'build',
    '--bundles',
    'app',
    '--config',
    'src-tauri/tauri.macos.conf.json',
  ],
  { cwd: desktop, stdio: 'inherit' },
)

const app = join(target, 'release', 'bundle', 'macos', 'Honsen Procure.app')
const executableDirectory = join(app, 'Contents', 'MacOS')
// Tauri includes every Cargo binary. Strip only known tools from this generated
// employee bundle; never touch sources, installed apps or user data.
for (const name of [
  'HonsenUpdateRunner',
  'honsen-procure-bootstrap-admin',
  'honsen-procure-seed',
  'honsen-procure-test-profile',
]) {
  rmSync(join(executableDirectory, name), { force: true })
}
assertEmployeeExecutables(readdirSync(executableDirectory))
execFileSync('codesign', ['--force', '--sign', '-', app], { stdio: 'inherit' })
execFileSync('codesign', ['--verify', '--deep', '--strict', app], {
  stdio: 'inherit',
})

const dmgDirectory = join(target, 'release', 'bundle', 'dmg')
mkdirSync(dmgDirectory, { recursive: true })
const dmg = join(dmgDirectory, `Honsen Procure_${config.version}_aarch64.dmg`)
const stage = mkdtempSync(join(tmpdir(), 'honsen-macos-dmg-'))
try {
  execFileSync('ditto', [app, join(stage, 'Honsen Procure.app')])
  symlinkSync('/Applications', join(stage, 'Applications'))
  execFileSync(
    'hdiutil',
    [
      'create',
      '-ov',
      '-volname',
      'Honsen Procure',
      '-srcfolder',
      stage,
      '-format',
      'UDZO',
      dmg,
    ],
    { stdio: 'inherit' },
  )
  execFileSync('hdiutil', ['verify', dmg], { stdio: 'inherit' })
  const checksum = createHash('sha256').update(readFileSync(dmg)).digest('hex')
  writeFileSync(`${dmg}.sha256`, `${checksum}\n`)
  console.log(`macOS candidate: ${dmg}\nSHA-256: ${checksum}`)
} finally {
  rmSync(stage, { recursive: true, force: true })
}
