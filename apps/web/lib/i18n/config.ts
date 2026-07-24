// Supported locales. Adding a language: add its entry here, add a
// messages/<code>.json file, and the type system will point out any key
// that translation is missing.
export const LOCALES = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

// Translator signature — matches the fn returned by useTranslations().
// Lib helpers accept this so they stay React-free but still localizable.
export type Translator = (key: string, params?: Record<string, string | number>) => string;

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && LOCALES.some((l) => l.code === value);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return LOCALES.find((l) => l.code === locale)?.dir ?? "ltr";
}
