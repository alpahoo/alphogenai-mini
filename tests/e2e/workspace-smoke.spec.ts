import { expect, test } from "@playwright/test";

test("public landing renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Create/i }).first()).toBeVisible();
  await expect(page.getByText(/AI video/i).first()).toBeVisible();
});

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /enter studio|sign in|log in|continue/i }).first()).toBeVisible();
});

test("public premium pages render without provider-facing copy", async ({ page }) => {
  const routes = [
    ["/pricing", /Choose the studio scale/i],
    ["/about", /people who want to direct AI/i],
    ["/technology", /system behind directed AI video/i],
    ["/blog", /Notes from the studio/i],
    ["/privacy", /Privacy Policy/i],
    ["/terms", /Terms of Service/i],
    ["/help/verified-face-id", /Find your verified face ID/i],
    ["/generate", /Start fast/i],
  ] as const;

  for (const [route, headline] of routes) {
    await page.goto(route);
    await expect(page.getByText(headline).first()).toBeVisible();
    await expect(page.getByText(/BytePlus|AtlasCloud|EvoLink|Bailian|Kie\.ai|HeyGen|Alibaba|Modal|Cloudflare/i)).toHaveCount(0);
  }
});

test("workspace routes are auth-gated without a session", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/create/story");
  await expect(page).toHaveURL(/\/login/);
});
