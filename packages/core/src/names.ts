export const LANGUAGES = ['fr', 'ar', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** A name stored in the three factory languages. English is the fallback. */
export type LocalizedName = { en: string; fr?: string; ar?: string };

export function tr(name: LocalizedName | null | undefined, lang: string): string {
  if (!name) return '';
  const v = (name as Record<string, string | undefined>)[lang];
  return v && v.trim() ? v : name.en || name.fr || name.ar || '';
}

export function isRtl(lang: string): boolean {
  return lang === 'ar';
}
