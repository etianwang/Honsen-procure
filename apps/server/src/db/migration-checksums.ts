// Exact historical bytes: only 001's unnecessary extension declaration changed.
// Keep the original database checksum/applied_at; never accept arbitrary edits.
export function isCompatibleMigrationChecksum(
  name: string,
  recorded: string,
  current: string,
): boolean {
  return (
    recorded === current ||
    (name === '001_auth_and_master_data.sql' &&
      recorded ===
        '22d91cb12793cfacd1d1ccc69fc2ab0b5bf6bbe996b3ceb32346931910905f2d' &&
      current ===
        'bc2992a3fe39c2905d1b12527d6065626dd0858953fc8aaa3d5204ce93fcea6b')
  )
}
