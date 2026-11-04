export const canonicalUpdateUrl =
  'https://api.github.com/repos/etianwang/Honsen-procure/releases/latest'

export function requireCanonicalUpdateUrl(value) {
  if (value !== canonicalUpdateUrl)
    throw new Error(
      'update source must be the canonical GitHub stable Release API',
    )
  return value
}

export function parseStableRelease(release) {
  if (
    !release ||
    release.draft !== false ||
    release.prerelease !== false ||
    typeof release.tag_name !== 'string' ||
    !/^v\d+\.\d+\.\d+(?:\.\d+)?$/.test(release.tag_name) ||
    !Array.isArray(release.assets)
  )
    throw new Error('invalid stable GitHub Release')
  const version = release.tag_name.slice(1)
  const name = `Honsen-Procure-${version}-Setup.exe`
  const installers = release.assets.filter(
    (asset) =>
      typeof asset?.name === 'string' && /setup\.exe$/i.test(asset.name),
  )
  if (installers.length !== 1 || installers[0].name !== name)
    throw new Error('expected exactly one version-matched setup asset')
  const asset = installers[0]
  const installerUrl = `https://github.com/etianwang/Honsen-procure/releases/download/${release.tag_name}/${name}`
  if (
    asset.browser_download_url !== installerUrl ||
    typeof asset.digest !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(asset.digest)
  )
    throw new Error('invalid installer URL or GitHub SHA-256 digest')
  return { version, installerUrl, sha256: asset.digest.slice(7) }
}

export async function fetchStableRelease(
  url = canonicalUpdateUrl,
  fetchImpl = globalThis.fetch,
) {
  requireCanonicalUpdateUrl(url)
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/vnd.github+json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok)
    throw new Error(`GitHub stable Release request failed: ${response.status}`)
  return parseStableRelease(await response.json())
}
