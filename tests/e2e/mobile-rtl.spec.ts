import { test, expect } from "@playwright/test";

/**
 * Mobile viewport + RTL layout tests
 *
 * Safety rules:
 *   ✓ Session API mocked — no DB queries
 *   ✓ localhost:3000 only
 *   ✓ No form submissions, no auth, no payments
 */

async function mockSessionApis(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );
}

test.describe("Mobile viewport — iPhone 14 (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockSessionApis(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
  });

  test("home page loads without crash on mobile", async ({ page }) => {
    await expect(page.locator("body")).toBeVisible();
    const text = await page.locator("body").textContent();
    expect(text).not.toContain("Application error");
    expect(text).not.toContain("Unhandled Runtime Error");
  });

  test("FIT ZONE brand is visible on mobile", async ({ page }) => {
    await expect(page.getByText("FIT ZONE").first()).toBeVisible();
  });

  test("page body does not overflow horizontally", async ({ page }) => {
    const scrollWidth: number = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(390 + 20);
  });

  test("navigation elements are accessible on mobile", async ({ page }) => {
    const hasHamburger = await page
      .locator("[aria-label*='menu' i], [aria-label*='قائمة' i], [aria-label*='Mobile' i]")
      .count();
    const hasNavItems = await page.locator("nav button, nav a, header button").count();
    expect(hasHamburger + hasNavItems).toBeGreaterThan(0);
  });
});

test.describe("Mobile viewport — small Android (360×800)", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("home page loads on small Android viewport", async ({ page }) => {
    await mockSessionApis(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText("FIT ZONE").first()).toBeVisible();
  });
});

test.describe("RTL layout verification", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("HTML document declares RTL direction", async ({ page }) => {
    await mockSessionApis(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const htmlDir = await page.locator("html").getAttribute("dir");
    const bodyDir = await page.locator("body").getAttribute("dir");
    const rtlCount = await page.locator("[dir='rtl']").count();
    const rtlApplied = htmlDir === "rtl" || bodyDir === "rtl" || rtlCount > 0;
    expect(rtlApplied).toBe(true);
  });

  test("Arabic Unicode characters are rendered on the home page", async ({ page }) => {
    await mockSessionApis(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    const body = await page.locator("body").textContent();
    expect(body).toMatch(/[؀-ۿ]/);
  });

  test("admin login page has dir=rtl element", async ({ page }) => {
    await page.goto("/admin/login");
    await page.waitForLoadState("domcontentloaded");
    const rtlElement = page.locator("[dir='rtl']").first();
    await expect(rtlElement).toBeVisible();
  });

  test("login page renders Arabic text correctly", async ({ page }) => {
    await mockSessionApis(page);
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    const body = await page.locator("body").textContent();
    expect(body).toMatch(/[؀-ۿ]/);
  });
});
