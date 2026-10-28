export const ROLES = ['tester', 'repairman', 'supervisor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | 'test' // pass / fail units in the test room
  | 'repair' // claim tickets, log repairs, send back to test
  | 'supervise' // assign, scrap, see everything
  | 'admin'; // catalogs, users, settings

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  tester: ['test'],
  repairman: ['repair'],
  supervisor: ['test', 'repair', 'supervise'],
  admin: ['test', 'repair', 'supervise', 'admin'],
};

export function can(roles: readonly string[], permission: Permission): boolean {
  return roles.some((r) => (ROLE_PERMISSIONS[r as Role] ?? []).includes(permission));
}

export const STATION_TYPES = ['quality', 'repair', 'display'] as const;
export type StationType = (typeof STATION_TYPES)[number];
