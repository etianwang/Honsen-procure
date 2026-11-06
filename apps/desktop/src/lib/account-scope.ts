import type { ReferenceMasterDataView } from './master-data-api'

export type AccountScope = {
  countryId: string
  projectId: string
  departmentId: string
  teamId: string
}
export const emptyAccountScope: AccountScope = {
  countryId: '',
  projectId: '',
  departmentId: '',
  teamId: '',
}
export type AllowedAccountScope = Pick<
  AccountScope,
  'projectId' | 'departmentId' | 'teamId'
>
export type AccountScopeOptions = {
  records: ReferenceMasterDataView[]
  allowed: AllowedAccountScope[] | null
}

export function validAccountScope(
  scope: AccountScope,
  options: AccountScopeOptions,
) {
  const { records, allowed } = options
  return (
    records.some(
      (r) => r.kind === 'country' && r.is_active && r.id === scope.countryId,
    ) &&
    records.some(
      (r) =>
        r.kind === 'project' &&
        r.is_active &&
        r.id === scope.projectId &&
        r.country_id === scope.countryId,
    ) &&
    records.some(
      (r) =>
        r.kind === 'department' && r.is_active && r.id === scope.departmentId,
    ) &&
    records.some(
      (r) =>
        r.kind === 'team' &&
        r.is_active &&
        r.id === scope.teamId &&
        r.department_id === scope.departmentId,
    ) &&
    (allowed === null ||
      allowed.some(
        (a) =>
          a.projectId === scope.projectId &&
          a.departmentId === scope.departmentId &&
          a.teamId === scope.teamId,
      ))
  )
}

export function accountScopeNames(
  scope: AccountScope,
  records: ReferenceMasterDataView[],
) {
  return [
    scope.countryId,
    scope.projectId,
    scope.departmentId,
    scope.teamId,
  ].map((id) => records.find((r) => r.id === id)?.name ?? '')
}
