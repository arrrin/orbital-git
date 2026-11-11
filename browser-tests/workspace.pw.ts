import { test, expect, type Page } from "@playwright/test";
async function contained(page: Page) {
  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(size.scrollWidth).toBeLessThanOrEqual(size.width);
  expect(size.scrollHeight).toBeLessThanOrEqual(size.height);
  await page.evaluate(() => window.scrollTo(10000, 10000));
  expect(
    await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })),
  ).toEqual({ x: 0, y: 0 });
}
test("custom dropdowns and large fonts stay within the window", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Working changes" }),
  ).toBeVisible();
  await contained(page);
  await page.getByRole("button", { name: /Preferences/ }).click();
  await page.getByRole("slider", { name: "Font size" }).focus();
  await page.keyboard.press("End");
  await expect(page.locator("html")).toHaveCSS("font-size", "18px");
  await page.getByRole("combobox", { name: "Interface font" }).click();
  const menu = page.getByRole("listbox", { name: "Interface font" });
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
  expect(box!.y + box!.height).toBeLessThanOrEqual(720);
  await page.getByRole("option", { name: "Arial", exact: true }).click();
  await contained(page);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.setViewportSize({ width: 1080, height: 700 });
  await contained(page);
  expect(errors).toEqual([]);
});
test("bottom-bar branch switching uses a custom dropdown and preserves the top control", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Switch branch from bottom bar" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Switch branch" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Branch", exact: true }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .locator(".repo-breadcrumb")
      .getByRole("button", { name: "main", exact: true }),
  ).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await contained(page);
});
