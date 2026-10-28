import type { LocalizedName } from '@gamut/core';

export type User = { id: number; employeeId: string; fullName: string; roles: string[]; language: string; active: boolean };
export type Category = { id: number; code: string; name: LocalizedName; active: boolean };
export type Model = { id: number; categoryId: number; code: string; name: string; brand: string; fpyTarget: number | null; active: boolean };
export type Color = { id: number; code: string; name: LocalizedName; active: boolean };
export type DefectCode = { id: number; categoryId: number; code: string; name: LocalizedName; active: boolean };
export type Component = { id: number; categoryId: number; name: LocalizedName; active: boolean };
export type ActionType = { id: number; name: LocalizedName; active: boolean };
export type ChecklistItem = {
  id: number;
  categoryId: number;
  name: LocalizedName;
  kind: 'ok' | 'measure';
  min: number | null;
  max: number | null;
  unit: string;
  sort: number;
  active: boolean;
};
export type StationRow = { id: number; name: string; type: 'quality' | 'repair' | 'display'; language: string; active: boolean };
export type SerialRule = { id: number; categoryId: number; label: string; pattern: string; example: string; priority: number; active: boolean };
export type Settings = { fpyTarget: number; maxRetestFails: number; idleLockMinutes: number };
export type Part = {
  id: number;
  partNumber: string;
  name: LocalizedName;
  categoryId: number | null;
  componentId: number | null;
  stockQty: number;
  minStock: number;
  active: boolean;
};
export type Photo = { id: number; unitId: number; ticketId: number | null; testId: number | null; mime: string; size: number; caption: string; uploadedBy: number; createdAt: string };

export type Catalog = {
  categories: Category[];
  models: Model[];
  colors: Color[];
  serialRules: SerialRule[];
  defectCodes: DefectCode[];
  components: Component[];
  actionTypes: ActionType[];
  checklistItems: ChecklistItem[];
  stations: StationRow[];
  users: User[];
  settings: Settings;
  parts: Part[];
};

export type Unit = {
  id: number;
  serial: string;
  categoryId: number;
  modelId: number | null;
  colorId: number | null;
  productionYear: number | null;
  productionMonth: number | null;
  status: string;
  firstPass: boolean | null;
  createdAt: string;
  releasedAt: string | null;
};

export type Ticket = {
  id: number;
  number: string;
  unitId: number;
  status: string;
  assignedTo: number | null;
  retestFails: number;
  alert: boolean;
  outcome: string | null;
  openedAt: string;
  sentToTestAt: string | null;
  closedAt: string | null;
  openedByTestId: number | null;
};

export type CheckResult = { id: number; testId: number; itemId: number; ok: boolean; value: number | null };
export type Test = {
  id: number;
  unitId: number;
  attemptNo: number;
  result: 'pass' | 'fail';
  defectCodeId: number | null;
  notes: string;
  testedBy: number;
  stationId: number | null;
  ticketId: number | null;
  testedAt: string;
  checks: CheckResult[];
};
export type Diagnosis = { id: number; ticketId: number; defectCodeId: number; notes: string; userId: number; createdAt: string };
export type RepairAction = {
  id: number;
  ticketId: number;
  userId: number;
  stationId: number | null;
  componentId: number;
  actionTypeId: number;
  description: string;
  parts: string;
  durationMin: number | null;
  createdAt: string;
  partsUsed?: Array<{ partId: number; quantity: number }>;
};
export type EventRow = {
  id: number;
  unitId: number | null;
  ticketId: number | null;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  userId: number | null;
  data: Record<string, any>;
  createdAt: string;
};
export type UnitHistory = { unit: Unit; tests: Test[]; tickets: Ticket[]; actions: RepairAction[]; diagnoses: Diagnosis[]; events: EventRow[]; photos: Photo[] };
