import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.env.HONSEN_RELEASE_VERSION
const updateManifestUrl =
  process.env.HONSEN_UPDATE_MANIFEST_URL ??
  'https://github.com/etianwang/Honsen-procure/releases/latest/download/manifest.json'
const targetDirectory = resolve(
  process.env.HONSEN_RELEASE_TARGET_DIR ?? 'E:/Honsen-build-cache/procure',
)
const tauriDirectory = join(root, 'apps', 'desktop', 'src-tauri')
const releaseAssets = join(tauriDirectory, 'release-assets')
const typescriptCli = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
const viteCli = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const tauriCli = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')

if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version ?? '')) {
  throw new Error(
    'HONSEN_RELEASE_VERSION must be a release version (major.minor.patch[.build])',
  )
}
if (!updateManifestUrl) {
  throw new Error(
    'HONSEN_UPDATE_MANIFEST_URL is required; no formal update URL is embedded by default',
  )
}

mkdirSync(releaseAssets, { recursive: true })
execFileSync(
  process.execPath,
  [join(root, 'scripts', 'generate-honsen-manifest.mjs'), releaseAssets],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      HONSEN_RELEASE_VERSION: version,
      HONSEN_UPDATE_MANIFEST_URL: updateManifestUrl,
    },
  },
)

{
  execFileSync(process.execPath, [typescriptCli, '-b'], {
    cwd: join(root, 'apps', 'desktop'),
    stdio: 'inherit',
  })
  execFileSync(process.execPath, [viteCli, 'build'], {
    cwd: join(root, 'apps', 'desktop'),
    stdio: 'inherit',
  })
  execFileSync('cargo', ['build', '--release', '--bin', 'HonsenUpdateRunner'], {
    cwd: tauriDirectory,
    stdio: 'inherit',
    env: { ...process.env, CARGO_TARGET_DIR: targetDirectory },
  })
  const runner = join(targetDirectory, 'release', 'HonsenUpdateRunner.exe')
  if (!existsSync(runner))
    throw new Error(`Runner build did not produce ${runner}`)
  cpSync(runner, join(releaseAssets, 'HonsenUpdateRunner.exe'))
  const releaseConfig = join(releaseAssets, 'tauri.release.conf.json')
  writeFileSync(
    releaseConfig,
    `${JSON.stringify(
      {
        version,
        bundle: {
          resources: {
            'release-assets/HonsenUpdateRunner.exe': 'HonsenUpdateRunner.exe',
            'release-assets/honsen.app.json': 'honsen.app.json',
          },
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  execFileSync(
    process.execPath,
    [tauriCli, 'build', '--bundles', 'nsis', '--config', releaseConfig],
    {
      cwd: join(root, 'apps', 'desktop'),
      stdio: 'inherit',
      env: { ...process.env, CARGO_TARGET_DIR: targetDirectory },
    },
  )
  const nsisDirectory = join(targetDirectory, 'release', 'bundle', 'nsis')
  const generatedInstaller = readdirSync(nsisDirectory).find((file) =>
    file.endsWith('-setup.exe'),
  )
  if (!generatedInstaller)
    throw new Error('Tauri did not produce an NSIS setup executable')
  const installer = join(nsisDirectory, `Honsen-Procure-${version}-Setup.exe`)
  renameSync(join(nsisDirectory, generatedInstaller), installer)
  const sha256 = createHash('sha256')
    .update(readFileSync(installer))
    .digest('hex')
  writeFileSync(
    `${installer}.sha256`,
    `${sha256}  ${installer.split(/[\\/]/).at(-1)}\n`,
    'utf8',
  )
  execFileSync(
    process.execPath,
    [
      join(root, 'scripts', 'generate-github-release-manifest.mjs'),
      installer,
      nsisDirectory,
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, HONSEN_RELEASE_VERSION: version },
    },
  )
  console.log(`Installer: ${installer}`)
  console.log(`SHA-256: ${sha256}`)
}
