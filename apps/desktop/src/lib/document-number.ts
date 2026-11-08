/** Display only real human-facing numbers; never fabricate a formal number. */
export function documentNumber(
  value: string | null | undefined,
  fallback: string,
): string {
  return !value?.trim() ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value)
    ? fallback
    : value
}
