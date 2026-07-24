import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import type { Locale } from "./config";

// `en.json` is the source of truth. Typing every other locale against it
// means the build fails loudly if a translation file falls out of sync
// (missing key, wrong nesting) instead of silently falling back at runtime.
export type Messages = typeof en;

export const MESSAGES: Record<Locale, Messages> = { en, ar };
