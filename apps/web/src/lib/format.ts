const LOCALES: Record<string, string> = { fr: 'fr-FR', ar: 'ar-u-nu-latn', en: 'en-GB' };

export const locale = (lang: string) => LOCALES[lang] ?? 'fr-FR';

export function fmtDateTime(iso: string | null | undefined, lang: string) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export function fmtTime(iso: string | null | undefined, lang: string) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale(lang), { timeStyle: 'short' }).format(new Date(iso));
}

/** "2 h 15 min" style duration since a date. */
export function sinceMinutes(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return null;
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
}

export function fmtMinutes(min: number | null | undefined, t: (k: string, o?: any) => string) {
  if (min == null) return '—';
  if (min < 60) return t('time.minutes', { count: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return t('time.hoursMinutes', { h, m });
  return t('time.days', { count: Math.floor(h / 24) });
}
