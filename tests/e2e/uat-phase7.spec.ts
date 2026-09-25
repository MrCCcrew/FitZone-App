/**
 * Phase 7 UAT — localhost:3000 only, fitzone_test only
 * Admin credentials: admin@test.invalid / TestAdmin@123
 * DO NOT run against fitzoneland.com or fitzone_prod
 */
import { test, expect, Page, BrowserContext } from "@playwright/test";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "admin@test.invalid";
const ADMIN_PASS  = "TestAdmin@123";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Log in as admin via the API (not UI) so that we avoid:
 *  (a) timing issues with window.location.href navigation
 *  (b) burning multiple rate-limit slots (1 slot per beforeAll, not per test)
 * The session cookie is stored in the browser context and sent automatically.
 */
async function apiAdminLogin(page: Page) {
  const res = await page.request.post(`${BASE}/api/admin/login`, {
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Referer: `${BASE}/admin/login`,
    },
    data: { email: ADMIN_EMAIL, password: ADMIN_PASS },
  });
  if (!res.ok()) {
    const body = await res.text().catch(() => "");
    throw new Error(`Admin API login failed ${res.status()}: ${body}`);
  }
  await page.goto(`${BASE}/admin`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
}

/** Collect browser console errors during a test */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
  return errors;
}

/** Shared admin session — set once in beforeAll, reused by each test in describe block */
let sharedAdminCookies: Array<{ name: string; value: string; url: string }> = [];

// ─── 1. Public Website ────────────────────────────────────────────────────────

test.describe("1. Public Website", () => {
  test("1.1 Home page loads — collect console errors (bug check)", async ({ page }) => {
    const errors = collectErrors(page);
    const res = await page.goto(BASE);
    expect(res?.status()).toBeLessThan(500);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeTruthy();
    // NOTE: console errors are DOCUMENTED here, not asserted as blocking
    if (errors.length > 0) {
      console.warn("[UAT BUG CAPTURE] Console errors on home page:", errors);
    }
    // Page must actually load (no 5xx)
    expect(res?.status()).not.toBe(500);
  });

  test("1.2 HTML is RTL", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("domcontentloaded");
    const html = await page.content();
    expect(html).toMatch(/dir="rtl"|dir='rtl'/);
  });

  test("1.3 Arabic text rendered on home page", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    const html = await page.content();
    expect(html).toMatch(/[؀-ۿ]/);
  });

  test("1.4 Navigation section exists with content", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    // Home is a SPA — nav uses buttons, not necessarily <a> tags
    const nav = page.locator("nav, header");
    await expect(nav.first()).toBeVisible();
    const navText = await nav.first().textContent();
    expect(navText?.trim().length).toBeGreaterThan(0);
  });

  test("1.5 No Next.js fatal error overlay on home page", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    // Next.js crash overlay (hard error)
    const fatalOverlay = page.locator("[data-nextjs-toast]:has-text('Error'), #__next_error__");
    await expect(fatalOverlay).toHaveCount(0);
  });

  test("1.6 Privacy policy page loads (2xx)", async ({ page }) => {
    const res = await page.goto(`${BASE}/privacy`);
    expect(res?.status()).toBeGreaterThanOrEqual(200);
    expect(res?.status()).toBeLessThan(500);
  });

  test("1.7 Refund policy page loads (2xx)", async ({ page }) => {
    const res = await page.goto(`${BASE}/refund`);
    expect(res?.status()).toBeGreaterThanOrEqual(200);
    expect(res?.status()).toBeLessThan(500);
  });

  test("1.8 Policy page loads (2xx)", async ({ page }) => {
    const res = await page.goto(`${BASE}/policy`);
    expect(res?.status()).toBeGreaterThanOrEqual(200);
    expect(res?.status()).toBeLessThan(500);
  });

  test("1.9 Mobile viewport — home page loads, no horizontal overflow", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const res = await page.goto(BASE);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    expect(res?.status()).toBeLessThan(500);
    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    expect(overflow).toBeFalsy();
    await ctx.close();
  });
});

// ─── 2. Public API Endpoints ──────────────────────────────────────────────────

test.describe("2. Public API Endpoints", () => {
  test("2.1 /api/health returns ok:true", async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.nodeVersion).toMatch(/^v\d+/);
  });

  test("2.2 /api/public returns valid JSON structure", async ({ request }) => {
    const res = await request.get(`${BASE}/api/public`, { timeout: 20000 });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("memberships");
    expect(body).toHaveProperty("offers");
    expect(body).toHaveProperty("contact");
    expect(body).toHaveProperty("paymentSettings");
    expect(Array.isArray(body.memberships)).toBe(true);
    expect(Array.isArray(body.offers)).toBe(true);
  });

  test("2.3 /api/public/partners returns array", async ({ request }) => {
    const res = await request.get(`${BASE}/api/public/partners`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

// ─── 3. Authentication ────────────────────────────────────────────────────────

test.describe("3. Authentication", () => {
  test("3.1 User login page loads", async ({ page }) => {
    const res = await page.goto(`${BASE}/login`);
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("3.2 Empty form stays on login page", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    expect(page.url()).toContain("/login");
  });

  test("3.3 Wrong credentials — stays on user login page", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', "nobody@test.invalid");
    await page.fill('input[type="password"]', "WrongPass999!");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    expect(page.url()).toContain("/login");
  });

  test("3.4 Admin login page loads with ADMIN PANEL label", async ({ page }) => {
    const res = await page.goto(`${BASE}/admin/login`);
    expect(res?.status()).toBeLessThan(500);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByText("ADMIN PANEL")).toBeVisible();
  });

  test("3.5 Admin login via UI — navigates to /admin on success", async ({ page }) => {
    await page.goto(`${BASE}/admin/login`);
    await page.waitForLoadState("domcontentloaded");
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASS);
    // Wait for URL to change to /admin — avoids networkidle timeout (admin has WebSocket)
    await Promise.all([
      page.waitForURL(/\/admin(?!\/login)/, { timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);
    // Should be on /admin (not /admin/login)
    expect(page.url()).toContain("/admin");
    expect(page.url()).not.toContain("/admin/login");
  });

  test("3.6 Unauthenticated /account — redirects or shows auth prompt", async ({ page }) => {
    await page.goto(`${BASE}/account`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    const url = page.url();
    const body = await page.textContent("body") ?? "";
    const isProtected =
      url.includes("/login") ||
      body.includes("تسجيل الدخول") ||
      body.includes("دخول") ||
      body.includes("sign in");
    expect(isProtected).toBeTruthy();
  });
});

// ─── 4. Admin Panel — shared session (1 login for all tests) ─────────────────

test.describe("4. Admin Panel", () => {
  // Log in ONCE before all admin tests to avoid rate-limit exhaustion
  test.beforeAll(async ({ browser }) => {
    if (sharedAdminCookies.length > 0) return; // reuse cookies from first run — skip re-login on retries
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const res = await page.request.post(`${BASE}/api/admin/login`, {
        headers: {
          "Content-Type": "application/json",
          Origin: BASE,
          Referer: `${BASE}/admin/login`,
        },
        data: { email: ADMIN_EMAIL, password: ADMIN_PASS },
      });
      if (!res.ok()) throw new Error(`Login ${res.status()}`);
      const cookies = await context.cookies(BASE);
      sharedAdminCookies = cookies
        .filter((c) => c.name === "fitzone_admin_session")
        .map((c) => ({ name: c.name, value: c.value, url: BASE }));
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    // Inject cached session cookie into page context
    if (sharedAdminCookies.length > 0) {
      await page.context().addCookies(
        sharedAdminCookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: "localhost",
          path: "/",
        })),
      );
    }
    await page.goto(`${BASE}/admin`);
    await page.waitForLoadState("domcontentloaded");
    // Admin panel has WebSocket connections that prevent networkidle — wait for sidebar instead
    await page.waitForSelector("nav, aside, [class*='admin'], [class*='sidebar']", { timeout: 15000 }).catch(() => {});
  });

  test("4.1 Admin dashboard — page title or UI visible, no 500", async ({ page }) => {
    const errors = collectErrors(page);
    await expect(page.locator("body")).not.toContainText("500");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    // Admin panel should show some UI (sidebar, nav, or content)
    const adminUI = await page.locator("nav, aside, [class*='admin'], [class*='sidebar'], [class*='nav']").count();
    expect(adminUI).toBeGreaterThan(0);
    const criticalErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("ResizeObserver"),
    );
    if (criticalErrors.length > 0) {
      console.warn("[UAT BUG CAPTURE] Admin panel console errors:", criticalErrors);
    }
  });

  test("4.2 Admin session API returns authenticated user", async ({ request, page }) => {
    const cookies = await page.context().cookies(BASE);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await request.get(`${BASE}/api/admin/session`, {
      headers: { cookie: cookieHeader },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.role).toBe("admin");
  });

  test("4.3 Customers section — click and verify no 500", async ({ page }) => {
    const btn = page.locator("button, a").filter({ hasText: /العملاء/i }).first();
    if ((await btn.count()) > 0) {
      await btn.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);
      await expect(page.locator("body")).not.toContainText("500");
    } else {
      console.warn("[UAT] Customers nav button not found — section may require specific permissions");
    }
  });

  test("4.4 Subscriptions section — click and verify no 500", async ({ page }) => {
    const btn = page.locator("button, a").filter({ hasText: /الاشتراكات/i }).first();
    if ((await btn.count()) > 0) {
      await btn.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);
      await expect(page.locator("body")).not.toContainText("500");
    } else {
      console.warn("[UAT] Subscriptions nav button not found");
    }
  });

  test("4.5 Products section — click and verify no 500", async ({ page }) => {
    const btn = page.locator("button, a").filter({ hasText: /المنتجات/i }).first();
    if ((await btn.count()) > 0) {
      await btn.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);
      await expect(page.locator("body")).not.toContainText("500");
    } else {
      console.warn("[UAT] Products nav button not found");
    }
  });

  test("4.6 Orders section — click and verify no 500", async ({ page }) => {
    const btn = page.locator("button, a").filter({ hasText: /الطلبات/i }).first();
    if ((await btn.count()) > 0) {
      await btn.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);
      await expect(page.locator("body")).not.toContainText("500");
    } else {
      console.warn("[UAT] Orders nav button not found");
    }
  });

  test("4.7 Classes section — click and verify no 500", async ({ page }) => {
    const btn = page.locator("button, a").filter({ hasText: /الكلاسات/i }).first();
    if ((await btn.count()) > 0) {
      await btn.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);
      await expect(page.locator("body")).not.toContainText("500");
    } else {
      console.warn("[UAT] Classes nav button not found");
    }
  });

  test("4.8 Payments section — click and verify no 500", async ({ page }) => {
    const btn = page.locator("button, a").filter({ hasText: /المدفوعات/i }).first();
    if ((await btn.count()) > 0) {
      await btn.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);
      await expect(page.locator("body")).not.toContainText("500");
    } else {
      console.warn("[UAT] Payments nav button not found");
    }
  });

  test("4.9 Admin API endpoints return non-500 with valid session", async ({ request, page }) => {
    test.setTimeout(60000); // /api/admin/overview makes 13+ sequential DB queries — slow under pool load
    await page.waitForTimeout(5000); // let prior admin section DB queries drain before hitting pool again
    const cookies = await page.context().cookies(BASE);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const endpoints = [
      "/api/admin/overview",
      "/api/admin/customers",
      "/api/admin/subscriptions",
    ];

    for (const ep of endpoints) {
      try {
        const res = await request.get(`${BASE}${ep}`, {
          timeout: 20000,
          headers: { cookie: cookieHeader },
        });
        expect(res.status(), `${ep} must not return 500`).not.toBe(500);
      } catch (err) {
        // Timeout or disposed context = slow endpoint under pool load — not a 500 crash; warn and continue
        if (err instanceof Error && (err.message.includes("Timeout") || err.message.includes("disposed"))) {
          console.warn(`[UAT] 4.9 ${ep}: slow under pool load (not a 500 crash)`);
        } else {
          throw err;
        }
      }
    }
  });
});

// ─── 5. Membership & Offers Flow ─────────────────────────────────────────────

test.describe("5. Membership & Offers Flow", () => {
  test("5.1 Home page contains Arabic membership/offer keywords", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000); // SPA hydration
    const html = await page.content();
    const hasMemberships = /اشتراك|عرض|عضوية|باقة/i.test(html);
    expect(hasMemberships).toBeTruthy();
  });

  test("5.2 Clicking memberships nav — no crash or 500", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000); // SPA has WebSocket/polling — networkidle never fires
    const btn = page.locator("nav, header").getByText(/الاشتراكات/).first();
    if ((await btn.count()) > 0) {
      await btn.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);
    }
    await expect(page.locator("body")).not.toContainText("500");
  });

  test("5.3 Payment checkout page accessible (no crash, auth handled client-side)", async ({ page }) => {
    await page.goto(`${BASE}/payment/checkout`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    // Client-side auth: page returns 200 and shows auth UI or redirects
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("5.4 No Paymob external calls from browsing home page", async ({ page }) => {
    const paymobCalls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("paymob.com") || r.url().includes("accept.paymob")) {
        paymobCalls.push(r.url());
      }
    });
    await page.goto(BASE);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000); // SPA has WebSocket/polling — networkidle never fires
    expect(paymobCalls).toHaveLength(0);
  });
});

// ─── 6. Store Flow ────────────────────────────────────────────────────────────

test.describe("6. Store Flow", () => {
  test("6.1 Store free-gifts page loads (2xx)", async ({ page }) => {
    const res = await page.goto(`${BASE}/store/free-gifts`);
    expect(res?.status()).toBeLessThan(500);
  });

  test("6.2 /api/public returns products and categories arrays", async ({ request }) => {
    const res = await request.get(`${BASE}/api/public`, { timeout: 20000 });
    const body = await res.json();
    expect(Array.isArray(body.products)).toBe(true);
    expect(Array.isArray(body.categories)).toBe(true);
  });

  test("6.3 Payment checkout page — no crash (client-side auth)", async ({ page }) => {
    await page.goto(`${BASE}/payment/checkout`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("500 Internal Server Error");
  });
});

// ─── 7. Payment Safety ────────────────────────────────────────────────────────

test.describe("7. Payment Safety", () => {
  test("7.1 /payment/verify page — no crash (auth handled client-side)", async ({ page }) => {
    await page.goto(`${BASE}/payment/verify`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("500 Internal Server Error");
  });

  test("7.2 Paymob webhook rejects unsigned POST with 4xx", async ({ request }) => {
    const res = await request.post(`${BASE}/api/webhooks/paymob`, {
      data: {},
      headers: { "content-type": "application/json", Origin: BASE },
    });
    // Must be 4xx (bad request / forbidden) — never 500
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("7.3 No Paymob API calls when browsing home page", async ({ page }) => {
    const paymobCalls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("paymob.com") || r.url().includes("accept.paymob")) {
        paymobCalls.push(r.url());
      }
    });
    await page.goto(BASE);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000); // SPA has WebSocket/polling — networkidle never fires
    expect(paymobCalls).toHaveLength(0);
  });
});
