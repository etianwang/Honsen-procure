import { fetchStableRelease } from './github-stable-release.mjs'

// Read-only live contract check. A missing qualified stable release is a failure,
// never permission to publish one or fall back to a custom manifest.
try {
  console.log(JSON.stringify(await fetchStableRelease(), null, 2))
} catch (error) {
  console.error(`Stable Release contract check failed: ${error.message}`)
  process.exitCode = 1
}
