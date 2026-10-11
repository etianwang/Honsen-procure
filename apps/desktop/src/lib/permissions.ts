export type UserRole =
  'engineer' | 'purchaser' | 'administrator' | 'viewer' | 'super_administrator'

export function canEditMaterials(role: UserRole): boolean {
  return role === 'purchaser' || role === 'administrator'
}
