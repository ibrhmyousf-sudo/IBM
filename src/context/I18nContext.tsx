import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { Locale } from '../types';
import enTranslations from '../lang/en.json';
import arTranslations from '../lang/ar.json';

interface I18nContextValue {
  locale: Locale;
  direction: 'ltr' | 'rtl';
  toggleLocale: () => void;
  setLocale: (loc: Locale) => void;
  t: (path: string, fallback?: string) => string;
}

const dictionaries: Record<Locale, Record<string, any>> = {
  en: enTranslations,
  ar: arTranslations
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('ibm_v2_locale') as Locale | null;
    return saved === 'ar' || saved === 'en' ? saved : 'en';
  });

  const direction: 'ltr' | 'rtl' = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    localStorage.setItem('ibm_v2_locale', locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
  }, [locale, direction]);

  const toggleLocale = useCallback(() => {
    setLocaleState(prev => (prev === 'en' ? 'ar' : 'en'));
  }, []);

  const setLocale = useCallback((loc: Locale) => {
    setLocaleState(loc);
  }, []);

  const t = useCallback(
    (path: string, fallback?: string): string => {
      const dict = dictionaries[locale] || dictionaries.en;
      const parts = path.split('.');
      let current: any = dict;

      for (const part of parts) {
        if (current === undefined || current === null) {
          break;
        }
        current = current[part];
      }

      if (typeof current === 'string') {
        return current;
      }

      // Fallback to English dictionary if missing in current
      let fallbackCurrent: any = dictionaries.en;
      for (const part of parts) {
        if (fallbackCurrent === undefined || fallbackCurrent === null) {
          break;
        }
        fallbackCurrent = fallbackCurrent[part];
      }

      if (typeof fallbackCurrent === 'string') {
        return fallbackCurrent;
      }

      return fallback ?? path;
    },
    [locale]
  );

  const value = useMemo(
    () => ({ locale, direction, toggleLocale, setLocale, t }),
    [locale, direction, toggleLocale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};

