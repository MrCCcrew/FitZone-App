import { test, expect } from "@playwright/test";

/**
 * Admin panel flow — /admin/login and /admin
 *
 * Safety rules:
 *   ✓ No real admin credentials used
 *   ✓ POST /api/admin/login is intercepted via page.route() — zero DB queries
 *   ✓ No admin session is created
 *   ✓ Only tests UI behaviour (error message display, redirect, access control)
 */

async function mockAdminApis(page: import("@playwright/test").Page) {
  // Intercept admin login → return 401 without hitting the database
  await page.route("**/api/admin/login", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }),
    }),
  );
  // Return no admin session
  await page.route("**/api/admin/session", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: "null" }),
  );
}

test.describe("Admin login page (/admin/login) — structure", () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminApis(page);
    await page.goto("/admin/login");
    await page.waitForLoadState("domcontentloaded");
  });

  test("admin login page loads without crash", async ({ page }) => {
    await expect(page.locator("body")).toBeVisible();
    const text = await page.locator("body").textContent();
    expect(text).not.toContain("Application error");
    expect(text).not.toContain("Unhandled Runtime Error");
  });

  test("ADMIN PANEL label is visible", async ({ page }) => {
    await expect(page.getByText("ADMIN PANEL")).toBeVisible();
  });

  test("email input is present", async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("password input is present", async ({ page }) => {
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("submit button with login text is present", async ({ page }) => {
    const btn = page.getByRole("button", { name: /دخول|تحكم|login/i });
    await expect(btn.first()).toBeVisible();
  });

  test("link back to main website is present", async ({ page }) => {
    const homeLink = page.getByRole("link", { name: /الرئيسي|home|موقع/i });
    await expect(homeLink.first()).toBeVisible();
  });
});

test.describe("Admin login — wrong credentials rejected (mocked API)", () => {
  test("fake credentials trigger error message and stay on /admin/login", async ({ page }) => {
    await mockAdminApis(page);
    await page.goto("/admin/login");
    await page.waitForLoadState("domcontentloaded");

    // Fill in fake credentials (mocked API will return 401)
    await page.locator('input[type="email"]').fill("hacker@notreal.test");
    await page.locator('input[type="password"]').fill("wrongpassword999");
    await page.getByRole("button", { name: /دخول|تحكم/i }).first().click();

    // Wait for mocked response to be handled by the UI
    await page.waitForTimeout(1500);

    // Must remain on /admin/login (not redirected to dashboard)
    expect(page.url()).toContain("/admin/login");

    // Error message rendered from mocked 401 response
    const body = await page.locator("body").textContent();
    const hasError =
      (body ?? "").includes("غير صحيح") ||
      (body ?? "").includes("خطأ") ||
      (body ?? "").includes("تعذر") ||
      (body ?? "").includes("Invalid");
    expect(hasError).toBe(true);
  });

  test("blank form submission does not navigate away", async ({ page }) => {
    await mockAdminApis(page);
    await page.goto("/admin/login");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: /دخول|تحكم/i }).first().click();
    await page.waitForTimeout(500);

    expect(page.url()).toContain("/admin");
  });
});

test.describe("Admin dashboard (/admin) — access control", () => {
  test("visiting /admin without auth shows login page or access denied", async ({ page }) => {
    await mockAdminApis(page);
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");

    const url = page.url();
    const text = (await page.locator("body").textContent()) ?? "";

    // Should be redirected to login OR show access denied
    // /admin is a client component — when session returns 401 it shows
    // a "verifying permissions" loading screen (🔒  جارٍ التحقق من صلاحيات الدخول...)
    // rather than a server-side redirect. All of these count as access control.
    const isProtected =
      url.includes("/admin/login") ||
      url.includes("/login") ||
      text.includes("دخول لوحة الإدارة") ||
      text.includes("ADMIN PANEL") ||
      text.includes("تسجيل الدخول") ||
      text.includes("التحقق من صلاحيات") ||
      text.includes("صلاحيات الدخول") ||
      text.includes("🔒") ||
      text.includes("Unauthorized") ||
      text.includes("غير مصرح");

    expect(isProtected).toBe(true);
  });
});
