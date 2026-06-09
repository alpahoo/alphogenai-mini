import { expect, test } from "@playwright/test";

test("public landing renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Create/i }).first()).toBeVisible();
  await expect(page.getByText(/AI video/i).first()).toBeVisible();
});

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /sign in|log in|continue/i }).first()).toBeVisible();
});

test("workspace routes are auth-gated without a session", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/create/story");
  await expect(page).toHaveURL(/\/login/);
});
