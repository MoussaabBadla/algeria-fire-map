"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DEFAULT_LOCALE, dirFor, LOCALE_COOKIE, type Locale } from "./config";
import { MESSAGES, type Messages } from "./messages";

type Params = Record<string, string | number>;

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in params ? String(params[key]) : `{${key}}`));
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Params) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof document !== "undefined") {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      document.documentElement.dir = dirFor(next);
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Params) => {
      const messages: Messages = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
      const value = getByPath(messages, key);
      if (typeof value !== "string") {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[i18n] Missing key "${key}" for locale "${locale}"`);
        }
        return key;
      }
      return interpolate(value, params);
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

// Namespaced translator — same ergonomics as next-intl's useTranslations,
// so this is a drop-in swap later if the project ever needs URL-based
// locale routing or ICU pluralization.
export function useTranslations(namespace?: string) {
  const { t } = useLocale();
  return useCallback((key: string, params?: Params) => t(namespace ? `${namespace}.${key}` : key, params), [t, namespace]);
}
