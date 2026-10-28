/** First-pass yield in percent (0–100), or null when nothing was tested. */
export function firstPassYield(passedFirstTime: number, testedFirstTime: number): number | null {
  if (testedFirstTime <= 0) return null;
  return Math.round((passedFirstTime / testedFirstTime) * 1000) / 10;
}

export type YieldLevel = 'good' | 'warning' | 'bad' | 'none';

/** Green at/above target, orange within 5 points below, red under that. */
export function yieldLevel(fpy: number | null, target: number): YieldLevel {
  if (fpy === null) return 'none';
  if (fpy >= target) return 'good';
  if (fpy >= target - 5) return 'warning';
  return 'bad';
}
