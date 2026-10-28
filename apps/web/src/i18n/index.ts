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

i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, ar: { translation: ar }, en: { translation: en } },
  lng: saved ?? 'fr',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

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
