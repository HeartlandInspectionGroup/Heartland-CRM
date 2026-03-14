// @ts-check
import { test, expect } from '@playwright/test';

// E2E tests require `npx netlify dev` running on port 8888

const SERVICE_PAGES = [
  'pre-purchase',
  'pre-listing',
  'radon-testing',
  'wdo',
  'sewer-scope',
  'mold-air-sampling',
  'thermal',
  'water-quality',
  'new-construction',
  'home-health-check',
];

for (const slug of SERVICE_PAGES) {
  test.describe(`Service page: ${slug}`, () => {
    test('loads without console errors', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto(`/services/${slug}.html`);
      // Allow Supabase-related errors (network dependent) but no JS syntax errors
      const jsErrors = errors.filter((e) => !e.includes('supabase') && !e.includes('fetch'));
      expect(jsErrors).toHaveLength(0);
    });

    test('has header, hero, CTA, and footer', async ({ page }) => {
      await page.goto(`/services/${slug}.html`);
      await expect(page.locator('.header')).toBeAttached();
      await expect(page.locator('.service-hero')).toBeVisible();
      await expect(page.locator('.service-cta')).toBeVisible();
      await expect(page.locator('.footer')).toBeAttached();
    });

    test('has FAQ section', async ({ page }) => {
      await page.goto(`/services/${slug}.html`);
      await expect(page.locator('.service-faq')).toBeAttached();
    });

    test('CTA buttons link to booking wizard', async ({ page }) => {
      await page.goto(`/services/${slug}.html`);
      const ctaLink = page.locator('.service-cta a.btn-primary');
      await expect(ctaLink).toHaveAttribute('href', /index\.html#bundle/);
    });
  });
}

test.describe('New Construction page specifics', () => {
  test('has pricing cards', async ({ page }) => {
    await page.goto('/services/new-construction.html');
    const pricingCards = page.locator('.pricing-card, .service-pricing-card, .nc-pricing-card, [class*="pricing"]');
    const count = await pricingCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Home Health Check page specifics', () => {
  test('has tier cards', async ({ page }) => {
    await page.goto('/services/home-health-check.html');
    const tierCards = page.locator('.tier-card, .hc-tier-card, [class*="tier"]');
    const count = await tierCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
