import { describe, expect, it } from 'vitest';
import {
  can,
  canTransition,
  decodeSerial,
  firstPassYield,
  isValidSerial,
  normalizeSerial,
  scanModeFor,
  tr,
  validateSerialPattern,
  yieldLevel,
} from '../src';

describe('ticket transitions', () => {
  it('follows the repair flow', () => {
    expect(canTransition('waiting_repair', 'in_repair')).toBe(true);
    expect(canTransition('in_repair', 'waiting_retest')).toBe(true);
    expect(canTransition('waiting_retest', 'closed')).toBe(true);
    expect(canTransition('waiting_retest', 'in_repair')).toBe(true);
  });
  it('blocks skipping the test room and reopening', () => {
    expect(canTransition('in_repair', 'closed')).toBe(false);
    expect(canTransition('waiting_repair', 'waiting_retest')).toBe(false);
    expect(canTransition('closed', 'in_repair')).toBe(false);
    expect(canTransition('scrapped', 'in_repair')).toBe(false);
  });
});

describe('scan mode', () => {
  it('detects what the test room should do', () => {
    expect(scanModeFor(null, null)).toBe('first_test');
    expect(scanModeFor({ status: 'waiting_retest' }, 'waiting_retest')).toBe('retest');
    expect(scanModeFor({ status: 'in_repair' }, 'in_repair')).toBe('in_repair');
    expect(scanModeFor({ status: 'in_repair' }, 'waiting_parts')).toBe('in_repair');
    expect(scanModeFor({ status: 'passed' }, null)).toBe('already_passed');
    expect(scanModeFor({ status: 'scrapped' }, null)).toBe('scrapped');
  });
});

describe('roles', () => {
  it('keeps testing and repairing separate', () => {
    expect(can(['tester'], 'test')).toBe(true);
    expect(can(['tester'], 'repair')).toBe(false);
    expect(can(['repairman'], 'test')).toBe(false);
    expect(can(['repairman'], 'repair')).toBe(true);
    expect(can(['supervisor'], 'supervise')).toBe(true);
    expect(can(['supervisor'], 'admin')).toBe(false);
    expect(can(['admin'], 'admin')).toBe(true);
    expect(can(['tester', 'repairman'], 'repair')).toBe(true);
  });
});

describe('serial numbers', () => {
  const rules = [
    {
      id: 1,
      categoryId: 7,
      priority: 0,
      active: true,
      pattern: '^(?<model>WM[0-9A-Z]{2})(?<color>[A-Z])(?<year>\\d{2})(?<month>\\d{2})\\d{6}$',
    },
    { id: 2, categoryId: 8, priority: 0, active: false, pattern: '^(?<model>.{4})' },
  ];

  it('normalizes and validates scans', () => {
    expect(normalizeSerial('  wm8f w 2610 000123 ')).toBe('WM8FW2610000123');
    expect(isValidSerial('WM8FW2610000123')).toBe(true);
    expect(isValidSerial('AB')).toBe(false);
    expect(isValidSerial('AB#12')).toBe(false);
  });

  it('reads model, color and date', () => {
    expect(decodeSerial('WM8FW2610000123', rules)).toEqual({
      ruleId: 1,
      categoryId: 7,
      modelCode: 'WM8F',
      colorCode: 'W',
      productionYear: 2026,
      productionMonth: 10,
    });
  });

  it('ignores inactive rules and returns null when nothing matches', () => {
    expect(decodeSerial('XXXXXXXX', rules)).toBeNull();
  });

  it('validates admin patterns', () => {
    expect(validateSerialPattern('^(?<model>.{4})')).toBeNull();
    expect(validateSerialPattern('^(.{4})')).toBe('serial_rule.missing_model_group');
    expect(validateSerialPattern('^(?<model>[A-Z')).toBe('serial_rule.invalid_regex');
  });
});

describe('names and KPIs', () => {
  it('falls back to English', () => {
    expect(tr({ en: 'Leak', fr: 'Fuite', ar: '' }, 'ar')).toBe('Leak');
    expect(tr({ en: 'Leak', fr: 'Fuite' }, 'fr')).toBe('Fuite');
  });
  it('computes first-pass yield and its color', () => {
    expect(firstPassYield(0, 0)).toBeNull();
    expect(firstPassYield(95, 100)).toBe(95);
    expect(firstPassYield(2, 3)).toBe(66.7);
    expect(yieldLevel(96, 95)).toBe('good');
    expect(yieldLevel(91, 95)).toBe('warning');
    expect(yieldLevel(80, 95)).toBe('bad');
    expect(yieldLevel(null, 95)).toBe('none');
  });
});
