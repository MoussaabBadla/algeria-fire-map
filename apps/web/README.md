This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Internationalization (i18n)

The UI is fully localized (currently **English** and **Arabic**, with Arabic in RTL).
The system is intentionally dependency-free and lives under `lib/i18n/`.

**How it works**

- Translations are plain JSON in `messages/<locale>.json`. `messages/en.json` is the
  source of truth — every other file is type-checked against its shape, so a missing or
  misspelled key fails `tsc` instead of silently breaking at runtime.
- The active locale is stored in a `locale` cookie (no URL change). `app/layout.tsx`
  reads it server-side and sets `<html lang dir>` and the Arabic font, so the first
  paint is already in the right language and direction (good for SEO, no flash).
- Components read strings with the `useTranslations()` hook from
  `lib/i18n/LocaleProvider`. Non-React helpers (in `lib/`) receive a `Translator`
  argument instead — see `relativeTime(iso, t)` and `riskLabel(cls, t)`.
- RTL is handled with CSS **logical properties** (`insetInlineStart/End`,
  `textAlign: "start"`) rather than physical `left/right`, so panels mirror
  automatically. The MapLibre wilaya labels switch between the `name` / `name_ar`
  GeoJSON properties, and the temporal timeline is pinned LTR on purpose.

**Add or change a UI string**

1. Add the key to `messages/en.json` (and the same key to every other locale file).
2. In a component: `const t = useTranslations(); … t("namespace.key")`.
   Interpolate with `t("statBadge.ofHotspotsUpdated", { total, time })`.

**Add a new language** (e.g. French)

1. Copy `messages/en.json` → `messages/fr.json` and translate the values.
2. Register it in `lib/i18n/config.ts`: add `{ code: "fr", label: "Français", dir: "ltr" }`
   to `LOCALES`, and add `fr` to the `MESSAGES` map in `lib/i18n/messages.ts`.
3. That's it — the language button appears in the switcher automatically and `tsc`
   will flag any key you forgot to translate.

Wilaya display names come from `lib/wilayas.json` (`name` / `name_ar`), resolved by
code via `lib/i18n/wilayaNames.ts`; add a `name_<locale>` field there for a new script.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
