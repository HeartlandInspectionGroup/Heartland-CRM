// @ts-check
import { test, expect } from '@playwright/test';

// E2E tests require `npx netlify dev` running on port 8888

test.describe('Homepage', () => {
  test('services grid has 10 cards', async ({ page }) => {
    await page.goto('/');
    const serviceCards = page.locator('.services-grid .service-card');
    await expect(serviceCards).toHaveCount(10);
  });

  test('each service card has title, description, and Learn More link', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('.services-grid .service-card');
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      await expect(card.locator('.service-title, h3')).toBeVisible();
      await expect(card.locator('.service-description, p')).toBeVisible();
      await expect(card.locator('a.service-link, a')).toBeAttached();
    }
  });

  test('booking wizard section exists', async ({ page }) => {
    await page.goto('/');
    const wizard = page.locator('#bundle');
    await expect(wizard).toBeAttached();
  });

  test('hero section has heading and CTA buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero h1')).toBeVisible();
    await expect(page.locator('.hero .btn-primary')).toBeVisible();
  });

  test('contact form section exists', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#contact')).toBeAttached();
    await expect(page.locator('#contactForm, form[name="contact"]')).toBeAttached();
  });

  test('footer is present with company info', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('.footer');
    await expect(footer).toBeAttached();
    await expect(footer.locator('text=Heartland')).toBeVisible();
  });
});
