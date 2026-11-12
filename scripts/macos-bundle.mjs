export function assertEmployeeExecutables(names) {
  if (names.length !== 1 || names[0] !== 'HonsenProcure') {
    throw new Error('macOS employee bundle must contain only HonsenProcure')
  }
}
