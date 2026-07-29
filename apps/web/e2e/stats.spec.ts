import { test, expect } from "@playwright/test";

// Visual + interaction smoke test for the /stats dashboard in English and
// Arabic (RTL). Runs on both the `desktop` and `mobile` projects, so the
// screenshots double as a responsive check.
// Run: npm run e2e            (headless, all projects)
//      npm run e2e:screens    (re-generate the full-page screenshots)
// Locale is chosen by the `locale` cookie (read server-side in app/layout.tsx).
for (const locale of ["en", "ar"] as const) {
  test(`stats page renders (${locale})`, async ({ page, context, baseURL }, testInfo) => {
    const url = new URL(baseURL ?? "http://localhost:3000");
    await context.addCookies([
      { name: "locale", value: locale, domain: url.hostname, path: "/" },
    ]);

    await page.goto("/stats", { waitUntil: "networkidle" });

    // Dashboard is up (not the "warming up" fallback) once a chart renders.
    await expect(page.locator('svg[role="img"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/warming up/i)).toHaveCount(0);
    expect(await page.locator("html").getAttribute("dir")).toBe(locale === "ar" ? "rtl" : "ltr");

    // Filter bar: year is now a <select> (not pills) and there's a wilaya picker.
    const yearSelect = page.getByRole("combobox").first();
    await expect(yearSelect).toBeVisible();
    const wilayaSelect = page.getByRole("combobox").nth(1);
    await expect(wilayaSelect).toBeVisible();

    // Bar must never overflow the viewport horizontally (responsive guard).
    const doc = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(doc.sw).toBeLessThanOrEqual(doc.cw + 1);

    await page.screenshot({
      path: testInfo.outputPath(`stats-${locale}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  });

  test(`wilaya picker redirects to wilaya stats (${locale})`, async ({ page, context, baseURL }) => {
    const url = new URL(baseURL ?? "http://localhost:3000");
    await context.addCookies([
      { name: "locale", value: locale, domain: url.hostname, path: "/" },
    ]);

    await page.goto("/stats", { waitUntil: "networkidle" });

    // Pick a wilaya (code 16 = Alger) from the second combobox → it should
    // navigate to that wilaya's dedicated stats page.
    const wilayaSelect = page.getByRole("combobox").nth(1);
    await wilayaSelect.selectOption("16");
    await page.waitForURL("**/stats/16");
    expect(new URL(page.url()).pathname).toBe("/stats/16");
  });
}
