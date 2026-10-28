/** Where a physical unit is right now. */
export const UNIT_STATUSES = ['passed', 'in_repair', 'waiting_retest', 'scrapped'] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

/** Repair ticket life cycle. A ticket is opened by a failed test. */
export const TICKET_STATUSES = [
  'waiting_repair',
  'in_repair',
  'waiting_parts',
  'waiting_retest',
  'closed',
  'scrapped',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const OPEN_TICKET_STATUSES: readonly TicketStatus[] = [
  'waiting_repair',
  'in_repair',
  'waiting_parts',
  'waiting_retest',
];

/** Statuses where the unit is physically with the repairmen. */
export const IN_REPAIR_TICKET_STATUSES: readonly TicketStatus[] = ['waiting_repair', 'in_repair', 'waiting_parts'];

export const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  waiting_repair: ['in_repair', 'scrapped'],
  in_repair: ['waiting_parts', 'waiting_retest', 'scrapped'],
  waiting_parts: ['in_repair', 'scrapped'],
  // Only the test room moves a ticket out of waiting_retest.
  waiting_retest: ['closed', 'in_repair', 'scrapped'],
  closed: [],
  scrapped: [],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

export function isOpenTicket(status: TicketStatus): boolean {
  return OPEN_TICKET_STATUSES.includes(status);
}

export const TEST_RESULTS = ['pass', 'fail'] as const;
export type TestResult = (typeof TEST_RESULTS)[number];

/** What the test room should do with a scanned serial. */
export type ScanMode =
  | 'first_test' // never seen before (or never tested)
  | 'retest' // came back from repair
  | 'already_passed' // passed before — can be tested again (repeat repair)
  | 'in_repair' // still with the repairmen — cannot be tested
  | 'scrapped'; // cannot be tested

export function scanModeFor(unit: { status: UnitStatus } | null, openTicketStatus: TicketStatus | null): ScanMode {
  if (!unit) return 'first_test';
  if (unit.status === 'scrapped') return 'scrapped';
  if (openTicketStatus === 'waiting_retest') return 'retest';
  if (openTicketStatus && IN_REPAIR_TICKET_STATUSES.includes(openTicketStatus)) return 'in_repair';
  return 'already_passed';
}
