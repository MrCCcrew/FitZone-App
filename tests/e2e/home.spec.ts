import { test, expect } from "@playwright/test";

/**
 * Public website flow — home page (/)
 * Assumes localhost:3000 is running (npm run dev).
 *
 * Safety guarantees:
 *   ✓ localhost:3000 only — no production domain
 *   ✓ Session API calls mocked to return null — no DB queries
 *   ✓ No real payments, no auth, no data modification
 */

async function mockSessionApis(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );
}

test.describe("Home page — public website flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockSessionApis(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000); // SPA has WebSocket/polling — networkidle never fires
  });

  test("page loads without crash", async ({ page }) => {
    await expect(page).not.toHaveTitle(/error|500|404/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("page title contains FitZone brand", async ({ page }) => {
    await expect(page).toHaveTitle(/fitzone/i);
  });

  test("FIT ZONE logo / brand name is visible in header", async ({ page }) => {
    await expect(page.getByText("FIT ZONE").first()).toBeVisible();
  });

  test("navigation bar contains Memberships link", async ({ page }) => {
    const nav = page.locator("nav, header");
    await expect(nav.getByText(/الاشتراكات/).first()).toBeVisible();
  });

  test("navigation bar contains Offers link", async ({ page }) => {
    const nav = page.locator("nav, header");
    await expect(nav.getByText(/العروض/).first()).toBeVisible();
  });

  test("navigation bar contains Schedule link", async ({ page }) => {
    const nav = page.locator("nav, header");
    await expect(nav.getByText(/الجدول/).first()).toBeVisible();
  });

  test("at least one CTA button is visible on the home page", async ({ page }) => {
    const cta = page.getByRole("button").first();
    await expect(cta).toBeVisible();
  });

  test("page does not display runtime error messages", async ({ page }) => {
    const body = await page.locator("body").textContent();
    expect(body).not.toContain("Application error");
    expect(body).not.toContain("Internal Server Error");
    expect(body).not.toContain("Unhandled Runtime Error");
  });

  test("page has dir=rtl for Arabic layout", async ({ page }) => {
    const htmlDir = await page.locator("html").getAttribute("dir");
    const bodyDir = await page.locator("body").getAttribute("dir");
    const anyRtl = await page.locator("[dir='rtl']").count();
    const rtlApplied = htmlDir === "rtl" || bodyDir === "rtl" || anyRtl > 0;
    expect(rtlApplied).toBe(true);
  });
});
