/**
 * Serial numbers carry the model code and the color code.
 * The exact format is set by an admin as a regular expression with named groups:
 *   (?<model>...)  model code      (required)
 *   (?<color>...)  color code      (optional)
 *   (?<year>..) (?<month>..)       production date (optional)
 * Example: ^(?<model>[A-Z0-9]{4})(?<color>[A-Z])(?<year>\d{2})(?<month>\d{2})\d{6}$
 */
export type SerialRule = {
  id: number;
  categoryId: number;
  pattern: string;
  active: boolean;
  priority: number;
};

export type DecodedSerial = {
  ruleId: number;
  categoryId: number;
  modelCode: string | null;
  colorCode: string | null;
  productionYear: number | null;
  productionMonth: number | null;
};

export const SERIAL_MIN = 3;
export const SERIAL_MAX = 64;
const SERIAL_CHARS = /^[A-Z0-9\-_/.]+$/;

export function normalizeSerial(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidSerial(serial: string): boolean {
  return serial.length >= SERIAL_MIN && serial.length <= SERIAL_MAX && SERIAL_CHARS.test(serial);
}

export function compileSerialPattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/** Checks a pattern an admin typed. Returns an error key, or null when fine. */
export function validateSerialPattern(pattern: string): string | null {
  const re = compileSerialPattern(pattern);
  if (!re) return 'serial_rule.invalid_regex';
  if (!pattern.includes('(?<model>')) return 'serial_rule.missing_model_group';
  return null;
}

export function decodeSerial(serial: string, rules: readonly SerialRule[]): DecodedSerial | null {
  const sorted = [...rules].filter((r) => r.active).sort((a, b) => b.priority - a.priority || a.id - b.id);
  for (const rule of sorted) {
    const re = compileSerialPattern(rule.pattern);
    if (!re) continue;
    const m = re.exec(serial);
    if (!m || !m.groups) continue;
    const g = m.groups;
    const year = g.year ? Number(g.year) : null;
    const month = g.month ? Number(g.month) : null;
    return {
      ruleId: rule.id,
      categoryId: rule.categoryId,
      modelCode: g.model ?? null,
      colorCode: g.color ?? null,
      productionYear: year === null ? null : year < 100 ? 2000 + year : year,
      productionMonth: month !== null && month >= 1 && month <= 12 ? month : null,
    };
  }
  return null;
}
