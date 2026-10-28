import { isRtl } from '@gamut/core';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar.json';
import en from './en.json';
import fr from './fr.json';

const saved = (() => {
  try {
    return localStorage.getItem('gamut.lang');
  } catch {
    return null;
  }
})();

export const BUILT_IN = { fr, ar, en } as Record<string, Record<string, unknown>>;

i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, ar: { translation: ar }, en: { translation: en } },
  lng: saved ?? 'fr',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  react: { bindI18nStore: 'added' },
});

/** Texts changed by an admin (Settings → Screen texts) replace the built-in ones. */
export async function loadTextOverrides() {
  try {
    const res = await fetch('/api/public/translations');
    if (!res.ok) return;
    const overrides = (await res.json()) as Record<string, Record<string, string>>;
    for (const lang of Object.keys(BUILT_IN)) {
      // Start again from the built-in texts, so removed overrides disappear too.
      i18n.addResourceBundle(lang, 'translation', structuredClone(BUILT_IN[lang]), false, true);
      for (const [key, value] of Object.entries(overrides[lang] ?? {})) i18n.addResource(lang, 'translation', key, value, { silent: true });
    }
    i18n.emit('added', i18n.language, 'translation');
  } catch {
    /* server unreachable: built-in texts stay */
  }
}

export function applyDocumentLanguage(lang: string) {
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
  try {
    localStorage.setItem('gamut.lang', lang);
  } catch {
    /* ignore */
  }
}
applyDocumentLanguage(i18n.language);

export default i18n;
