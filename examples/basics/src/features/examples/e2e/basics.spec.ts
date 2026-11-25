// The example app in a real browser: each part of the demo works end to end, and the
// page raises no errors while it does. These flows use the built bundle, so they catch
// what the unit and integration tests cannot: the build, the decorators, and the
// browser's own events and timing.

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("a component's styleUrls files style it", async ({ page }) => {
  await expect(page.locator("tk-notice .notice"))
    .toHaveCSS("border-left-color", "rgb(0, 102, 204)");
});

test("the page loads without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.reload();
  await expect(page.locator("tk-counter h2"))
    .toHaveText("Counter");
  await expect(page.locator("tk-clock h2"))
    .toHaveText("Clock");
  await expect(page.locator("tk-todos h2"))
    .toHaveText("Todos");
  await expect(page.locator("tk-patterns h2"))
    .toHaveText("Patterns");
  expect(errors)
    .toEqual([]);
});

test("the counter's buttons change the count, its parity and its class", async ({ page }) => {
  const count = page.locator("tk-counter p", { hasText: "Count:" });
  await expect(count)
    .toHaveText("Count: 0 (even)");

  await page.locator("tk-counter button[step=\"1\"]")
    .click();
  await expect(count)
    .toHaveText("Count: 1 (odd)");

  await page.locator("tk-counter button[step=\"-1\"]")
    .click();
  await page.locator("tk-counter button[step=\"-1\"]")
    .click();
  await expect(count)
    .toHaveText("Count: -1 (odd)");
  await expect(count)
    .toHaveClass(/negative/);

  await page.locator("tk-counter button[step=\"10\"]")
    .click();
  await expect(count)
    .toHaveText("Count: 9 (odd)");
  await expect(count).not.toHaveClass(/negative/);
});

test("the todo list adds, toggles and clears, and shows the empty case", async ({ page }) => {
  const todos = page.locator("tk-todos");
  const items = todos.locator("ul")
    .first()
    .locator("li");
  const before = await items.count();

  await todos.getByRole("button", { name: "Add", exact: true })
    .click();
  await expect(items)
    .toHaveCount(before + 1);

  // The second todo starts not done; the first starts done.
  const second = items.nth(1);
  await expect(second).not.toHaveClass(/done/);
  await second.locator("button")
    .click();
  await expect(second)
    .toHaveClass(/done/);

  await todos.getByRole("button", { name: "Clear", exact: true })
    .click();
  await expect(todos.getByText("Nothing to do"))
    .toBeVisible();
});

test("the pattern demo steps through its statuses, one branch at a time", async ({ page }) => {
  const patterns = page.locator("tk-patterns");
  const status = patterns.locator("p", { hasText: /^(Ready|Working…|Stopped:)/ });
  const next = patterns.getByRole("button", { name: "Next status" });

  const seen = new Set<string>();
  for (let step = 0; step < 4; step++) {
    seen.add((await status.first()
      .textContent())?.trim() ?? "");
    await next.click();
  }
  expect(seen.size)
    .toBeGreaterThan(1);
});

test("the header links to the API reference, a page of its own, and back", async ({ page }) => {
  await page.getByRole("link", { name: "API reference" })
    .click();
  await expect(page)
    .toHaveURL(/\/api$/);
  await expect(page.locator("tk-api-overview h1"))
    .toHaveText("API reference");

  await page.getByRole("link", { name: "Examples" })
    .click();
  await expect(page.locator("tk-counter h2"))
    .toHaveText("Counter");
});

test("the API pages: a package lists its exports, and an export has its own page", async ({ page }) => {
  await page.getByRole("link", { name: "API reference" })
    .click();
  await page.locator("aside.sidebar a[href=\"/api/core\"]")
    .click();
  await expect(page)
    .toHaveURL(/\/api\/core$/);
  await expect(page.locator("tk-api-package-list h1"))
    .toHaveText("@tinker/core");

  await page.getByRole("link", { name: "bootstrap", exact: true })
    .click();
  await expect(page)
    .toHaveURL(/\/api\/core\/bootstrap$/);
  await expect(page.locator("tk-api-symbol tk-doc-body h3"))
    .toContainText("bootstrap");

  // The sidebar keeps working from an export's page, and the page follows the URL.
  await page.locator("aside.sidebar a[href=\"/api/router\"]")
    .click();
  await expect(page.locator("tk-api-package-list h1"))
    .toHaveText("@tinker/router");
});

test("the clock shows a time, and it is still running", async ({ page }) => {
  const time = page.locator("tk-clock p")
    .first();
  await expect(time)
    .toHaveText(/\d{1,2}:\d{2}:\d{2}/);
  const first = await time.textContent();
  await expect.poll(() => time.textContent(), { timeout: 3_000 }).not.toBe(first);
});
