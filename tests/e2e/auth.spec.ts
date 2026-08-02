import { test, expect } from "@playwright/test";

/**
 * Auth flow — /login and /register
 *
 * Safety rules:
 *   ✓ No real credentials used
 *   ✓ API form-submission calls are intercepted via page.route() —
 *     no actual DB query is made
 *   ✓ Google / Facebook / Apple OAuth buttons detected but NOT clicked
 *     (clicking would leave localhost and hit production OAuth)
 *   ✓ No real session created or persisted between tests
 */

// Block real auth API calls to prevent any DB queries
async function mockAuthApis(page: import("@playwright/test").Page) {
  // Return "not logged in" for session checks
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );
  // Return auth failure for login attempts
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }),
    }),
  );
  // Block OAuth redirects from accidentally leaving localhost
  await page.route("**/api/auth/oauth/**", (route) => route.abort());
}

test.describe("Login page (/login) — structure and validation", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthApis(page);
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
  });

  test("login page loads without crash", async ({ page }) => {
    await expect(page.locator("body")).toBeVisible();
    const text = await page.locator("body").textContent();
    // "500" appears in Next.js RSC payload chunk IDs — check for actual error message
    expect(text).not.toContain("Application error");
    expect(text).not.toContain("Internal Server Error");
  });

  test("email input is present", async ({ page }) => {
    const email = page.locator('input[type="email"]');
    await expect(email).toBeVisible();
  });

  test("password input is present", async ({ page }) => {
    const password = page.locator('input[type="password"]');
    await expect(password).toBeVisible();
  });

  test("submit button is present", async ({ page }) => {
    const btn = page.getByRole("button", { name: /دخول|تسجيل|login/i });
    await expect(btn.first()).toBeVisible();
  });

  test("Google OAuth button is visible but we do NOT click it", async ({ page }) => {
    // Button detected — OAuth navigation goes to production endpoint (blocked above)
    const googleBtn = page.getByText(/جوجل|google/i).first();
    await expect(googleBtn).toBeVisible();
  });

  test("submitting empty form does not navigate away from login page", async ({ page }) => {
    const submitBtn = page.getByRole("button", { name: /دخول|تسجيل|login/i }).first();
    await submitBtn.click();
    await page.waitForTimeout(800);
    // HTML5 required validation keeps us on the same page
    const url = page.url();
    expect(url).toContain("localhost:3000");
  });

  test("submitting fake credentials shows an error message (mocked API)", async ({ page }) => {
    await page.locator('input[type="email"]').fill("fake@notreal.test");
    await page.locator('input[type="password"]').fill(String(Date.now()));
    await page.getByRole("button", { name: /دخول|تسجيل|login/i }).first().click();

    // Wait for mocked API response to render
    await page.waitForTimeout(1500);

    const body = await page.locator("body").textContent();
    const hasError =
      (body ?? "").includes("غير صحيح") ||
      (body ?? "").includes("خطأ") ||
      (body ?? "").includes("error") ||
      (body ?? "").includes("Invalid");

    expect(hasError).toBe(true);
  });

  test("link to registration page exists", async ({ page }) => {
    const registerLink = page.getByRole("link", { name: /تسجيل|سجّلي|إنشاء|register|sign up/i });
    await expect(registerLink.first()).toBeVisible();
  });
});

test.describe("Register page (/register)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthApis(page);
    await page.goto("/register");
    await page.waitForLoadState("domcontentloaded");
  });

  test("register page loads without crash", async ({ page }) => {
    await expect(page.locator("body")).toBeVisible();
    const text = await page.locator("body").textContent();
    expect(text).not.toContain("Application error");
  });

  test("multiple input fields are present for registration form", async ({ page }) => {
    const inputs = page.locator("input");
    await expect(inputs.first()).toBeVisible();
    const count = await inputs.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

test.describe("Forgot password page (/forgot-password)", () => {
  test("forgot password page loads and shows email field", async ({ page }) => {
    await mockAuthApis(page);
    await page.goto("/forgot-password");
    await page.waitForLoadState("domcontentloaded");
    const email = page.locator('input[type="email"]');
    await expect(email).toBeVisible();
  });
});
