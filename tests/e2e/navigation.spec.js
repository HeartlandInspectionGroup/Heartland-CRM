// @ts-check
import { test, expect } from '@playwright/test';

// E2E tests require `npx netlify dev` running on port 8888

test.describe('Navigation', () => {
  test('homepage loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Heartland/);
  });

  test('all 10 service links are present in nav dropdown', async ({ page }) => {
    await page.goto('/');
    const expectedServices = [
      'Pre-Purchase Inspection',
      'Pre-Listing Inspection',
      'Radon Testing',
      'WDO Inspection',
      'Sewer Scope',
      'Mold/Air Sampling',
      'Thermal Imaging',
      'Water Quality Testing',
      'New Construction',
      'Home Health Check',
    ];

    for (const service of expectedServices) {
      const link = page.locator('.dropdown-menu a', { hasText: service });
      await expect(link).toBeAttached();
    }
  });

  test('clicking a service link navigates to the correct page', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('.dropdown-menu a', { hasText: 'Radon Testing' });
    await link.click();
    await expect(page).toHaveURL(/radon-testing/);
    await expect(page.locator('h1')).toContainText(/Radon/i);
  });

  test('breadcrumbs are present on service pages', async ({ page }) => {
    await page.goto('/services/pre-purchase.html');
    const breadcrumbs = page.locator('.breadcrumbs');
    await expect(breadcrumbs).toBeVisible();
    await expect(breadcrumbs.locator('a', { hasText: 'Home' })).toBeVisible();
    await expect(breadcrumbs.locator('a', { hasText: 'Services' })).toBeVisible();
  });

  test('mobile menu toggle works at 375px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    const toggle = page.locator('.mobile-toggle');
    const navMenu = page.locator('.nav-menu');

    await expect(toggle).toBeVisible();
    // Nav should not be active initially
    await expect(navMenu).not.toHaveClass(/active/);

    // Click to open
    await toggle.click();
    await expect(navMenu).toHaveClass(/active/);

    // Click again to close
    await toggle.click();
    await expect(navMenu).not.toHaveClass(/active/);
  });
});
