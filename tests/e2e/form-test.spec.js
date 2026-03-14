// @ts-check
import { test, expect } from '@playwright/test';

// E2E tests require `npx netlify dev` running on port 8888

test.describe('Form Test Page', () => {
  test('loads successfully', async ({ page }) => {
    await page.goto('/form-test.html');
    await expect(page).toHaveTitle(/Test|Property|Form/i);
  });

  test('has an address input field', async ({ page }) => {
    await page.goto('/form-test.html');
    const input = page.locator('input[type="text"], input[placeholder*="address" i], #address, #testAddress');
    await expect(input.first()).toBeVisible();
  });

  test('lookup button is present', async ({ page }) => {
    await page.goto('/form-test.html');
    const btn = page.locator('button', { hasText: /look\s*up|search|submit/i });
    await expect(btn.first()).toBeVisible();
  });
});
