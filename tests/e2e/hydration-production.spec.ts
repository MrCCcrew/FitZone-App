import { expect, test } from "@playwright/test";

const paths = ["/", "/?page=shop", "/?page=memberships", "/?page=trainers", "/?page=schedule"];
const hydrationError = /#418|hydration|server rendered html|text content did not match/i;

for (const path of paths) {
  test(`production hydration: ${path}`, async ({ page }) => {
    const errors: string[] = [];
    const dataFailures: string[] = [];
    page.on("console", (message) => {
      if ((message.type() === "error" || message.type() === "warning") && hydrationError.test(message.text())) errors.push(message.text());
    });
    page.on("pageerror", (error) => { if (hydrationError.test(error.message)) errors.push(error.message); });
    page.on("response", (response) => {
      const url = response.url();
      if (/\/api\/(?:public|site-content|settings)/.test(url) && response.status() >= 400) {
        dataFailures.push(`${response.status()} ${url}`);
      }
    });
    page.on("requestfailed", (request) => {
      if (/\/api\/(?:public|site-content|settings)/.test(request.url())) dataFailures.push(`failed ${request.url()}`);
    });

    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator("body")).toBeVisible();
    await page.waitForTimeout(300);
    expect(errors, errors.join("\n")).toEqual([]);
    expect(dataFailures, dataFailures.join("\n")).toEqual([]);
  });
}
