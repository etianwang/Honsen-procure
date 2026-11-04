export function selectNsisInstaller(files, productName, version) {
  const prefix = `${productName}_${version}_`
  const candidates = files.filter(
    (file) =>
      file.startsWith(prefix) &&
      /^\w+-setup\.exe$/.test(file.slice(prefix.length)),
  )
  if (candidates.length !== 1) {
    throw new Error(
      `Expected one generated NSIS installer for ${productName} ${version}; found ${candidates.length}`,
    )
  }
  return candidates[0]
}
