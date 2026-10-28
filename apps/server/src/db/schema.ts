import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { LocalizedName } from '@gamut/core';

const name = () => jsonb('name').$type<LocalizedName>().notNull();
const active = () => boolean('active').notNull().default(true);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ---------- Catalogs (filled in manually by admins) ----------

/** Appliance type: Washing machine, Dryer, Fridge… */
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: name(),
  active: active(),
});

export const models = pgTable(
  'models',
  {
    id: serial('id').primaryKey(),
    categoryId: integer('category_id').notNull().references(() => categories.id),
    /** The model code as it appears inside the serial number. */
    code: text('code').notNull(),
    name: text('name').notNull(),
    brand: text('brand').notNull().default(''),
    attributes: jsonb('attributes').$type<Record<string, string>>().notNull().default({}),
    /** First-pass yield target for this model (%). Empty = use the general target. */
    fpyTarget: doublePrecision('fpy_target'),
    active: active(),
  },
  (t) => [uniqueIndex('models_category_code').on(t.categoryId, t.code)],
);

export const colors = pgTable('colors', {
  id: serial('id').primaryKey(),
  /** The color code as it appears inside the serial number. */
  code: text('code').notNull().unique(),
  name: name(),
  active: active(),
});

/** How to read model / color / date out of a serial number. */
export const serialRules = pgTable('serial_rules', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').notNull().references(() => categories.id),
  label: text('label').notNull(),
  pattern: text('pattern').notNull(),
  example: text('example').notNull().default(''),
  priority: integer('priority').notNull().default(0),
  active: active(),
});

export const defectCodes = pgTable(
  'defect_codes',
  {
    id: serial('id').primaryKey(),
    categoryId: integer('category_id').notNull().references(() => categories.id),
    code: text('code').notNull(),
    name: name(),
    active: active(),
  },
  (t) => [uniqueIndex('defect_codes_category_code').on(t.categoryId, t.code)],
);

/** Parts of the machine that get repaired (drain pump, door lock…). */
export const components = pgTable('components', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').notNull().references(() => categories.id),
  name: name(),
  active: active(),
});

/** Replaced, adjusted, cleaned… */
export const actionTypes = pgTable('action_types', {
  id: serial('id').primaryKey(),
  name: name(),
  active: active(),
});

export const checklistItems = pgTable('checklist_items', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').notNull().references(() => categories.id),
  name: name(),
  /** 'ok' = OK / not OK, 'measure' = number with min / max */
  kind: text('kind').$type<'ok' | 'measure'>().notNull().default('ok'),
  min: doublePrecision('min'),
  max: doublePrecision('max'),
  unit: text('unit').notNull().default(''),
  sort: integer('sort').notNull().default(0),
  active: active(),
});

// ---------- People and PCs ----------

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  employeeId: text('employee_id').notNull().unique(),
  fullName: text('full_name').notNull(),
  roles: text('roles').array().notNull().default(sql`'{}'::text[]`),
  language: text('language').notNull().default('fr'),
  pinHash: text('pin_hash').notNull(),
  active: active(),
  createdAt: createdAt(),
});

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: createdAt(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stations = pgTable('stations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<'quality' | 'repair' | 'display'>().notNull(),
  language: text('language').notNull().default('fr'),
  active: active(),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

// ---------- Units, tests, repairs ----------

export const units = pgTable(
  'units',
  {
    id: serial('id').primaryKey(),
    serial: text('serial').notNull().unique(),
    categoryId: integer('category_id').notNull().references(() => categories.id),
    modelId: integer('model_id').references(() => models.id),
    colorId: integer('color_id').references(() => colors.id),
    productionYear: integer('production_year'),
    productionMonth: integer('production_month'),
    status: text('status').notNull(),
    /** true = passed on its very first test. Set by the first test. */
    firstPass: boolean('first_pass'),
    createdAt: createdAt(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => [index('units_status').on(t.status)],
);

export const ticketNumberSeq = pgSequence('ticket_number_seq');

export const tickets = pgTable(
  'tickets',
  {
    id: serial('id').primaryKey(),
    number: text('number').notNull().unique(),
    unitId: integer('unit_id').notNull().references(() => units.id),
    openedByTestId: integer('opened_by_test_id'),
    status: text('status').notNull(),
    assignedTo: integer('assigned_to').references(() => users.id),
    /** How many times this repair failed the retest. */
    retestFails: integer('retest_fails').notNull().default(0),
    /** Raised after too many failed retests — supervisor attention. */
    alert: boolean('alert').notNull().default(false),
    outcome: text('outcome'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    sentToTestAt: timestamp('sent_to_test_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (t) => [index('tickets_status').on(t.status), index('tickets_unit').on(t.unitId)],
);

export const tests = pgTable(
  'tests',
  {
    id: serial('id').primaryKey(),
    unitId: integer('unit_id').notNull().references(() => units.id),
    attemptNo: integer('attempt_no').notNull(),
    result: text('result').$type<'pass' | 'fail'>().notNull(),
    defectCodeId: integer('defect_code_id').references(() => defectCodes.id),
    notes: text('notes').notNull().default(''),
    testedBy: integer('tested_by').notNull().references(() => users.id),
    stationId: integer('station_id').references(() => stations.id),
    ticketId: integer('ticket_id').references(() => tickets.id),
    testedAt: timestamp('tested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tests_tested_at').on(t.testedAt), index('tests_unit').on(t.unitId)],
);

export const checkResults = pgTable('check_results', {
  id: serial('id').primaryKey(),
  testId: integer('test_id').notNull().references(() => tests.id),
  itemId: integer('item_id').notNull().references(() => checklistItems.id),
  ok: boolean('ok').notNull(),
  value: doublePrecision('value'),
});

export const diagnoses = pgTable('diagnoses', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id').notNull().references(() => tickets.id),
  defectCodeId: integer('defect_code_id').notNull().references(() => defectCodes.id),
  notes: text('notes').notNull().default(''),
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const repairActions = pgTable('repair_actions', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id').notNull().references(() => tickets.id),
  userId: integer('user_id').notNull().references(() => users.id),
  stationId: integer('station_id').references(() => stations.id),
  componentId: integer('component_id').notNull().references(() => components.id),
  actionTypeId: integer('action_type_id').notNull().references(() => actionTypes.id),
  description: text('description').notNull().default(''),
  parts: text('parts').notNull().default(''),
  durationMin: integer('duration_min'),
  createdAt: createdAt(),
});

/** Everything that happened, in order. Never edited, never deleted. */
export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    unitId: integer('unit_id').references(() => units.id),
    ticketId: integer('ticket_id').references(() => tickets.id),
    type: text('type').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    userId: integer('user_id').references(() => users.id),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('events_unit').on(t.unitId), index('events_ticket').on(t.ticketId)],
);

// ---------- Spare parts ----------

export const parts = pgTable('parts', {
  id: serial('id').primaryKey(),
  partNumber: text('part_number').notNull().unique(),
  name: name(),
  /** Optional: which product type / machine part this spare part belongs to. */
  categoryId: integer('category_id').references(() => categories.id),
  componentId: integer('component_id').references(() => components.id),
  stockQty: integer('stock_qty').notNull().default(0),
  /** Alert when stock is at or below this level. 0 = no alert. */
  minStock: integer('min_stock').notNull().default(0),
  active: active(),
});

export const partsUsed = pgTable('parts_used', {
  id: serial('id').primaryKey(),
  repairActionId: integer('repair_action_id').notNull().references(() => repairActions.id),
  partId: integer('part_id').notNull().references(() => parts.id),
  quantity: integer('quantity').notNull(),
});

/** Every change to stock: used in a repair, received, counted. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: serial('id').primaryKey(),
    partId: integer('part_id').notNull().references(() => parts.id),
    delta: integer('delta').notNull(),
    reason: text('reason').$type<'used' | 'received' | 'count'>().notNull(),
    ticketId: integer('ticket_id').references(() => tickets.id),
    note: text('note').notNull().default(''),
    userId: integer('user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('stock_movements_part').on(t.partId)],
);

// ---------- Photos ----------

export const attachments = pgTable(
  'attachments',
  {
    id: serial('id').primaryKey(),
    unitId: integer('unit_id').notNull().references(() => units.id),
    ticketId: integer('ticket_id').references(() => tickets.id),
    testId: integer('test_id').references(() => tests.id),
    /** File name inside the uploads folder. */
    storageKey: text('storage_key').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    caption: text('caption').notNull().default(''),
    uploadedBy: integer('uploaded_by').notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('attachments_unit').on(t.unitId)],
);

// ---------- Screen texts edited by admins (override the built-in translations) ----------

export const translations = pgTable(
  'translations',
  {
    id: serial('id').primaryKey(),
    lang: text('lang').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('translations_lang_key').on(t.lang, t.key)],
);
