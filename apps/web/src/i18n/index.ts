// src/i18n/index.ts
// [F-ID: FE-I18N-01]
// @version 1.0.0
// @changelog 1.0.0 — react-i18next setup. Spanish is the default
//   language (not English) because the initial real market for this
//   project's product framing is Latin America -- English is an
//   opt-in secondary toggle, not the default. Choice persists in
//   localStorage under STORAGE_KEY so a reload keeps the user's pick.
//   No i18next-browser-languagedetector dependency: the app only
//   supports two languages and the default rule above is explicit,
//   so a detector plugin would add a dependency to override behavior
//   we want to control directly.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';

export const STORAGE_KEY = 'app_language';

const storedLanguage =
  typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: storedLanguage === 'en' ? 'en' : 'es',
  fallbackLng: 'es',
  interpolation: {
    escapeValue: false,
  },
});

export function setLanguage(lang: 'es' | 'en') {
  i18n.changeLanguage(lang);
  localStorage.setItem(STORAGE_KEY, lang);
}

export default i18n;
