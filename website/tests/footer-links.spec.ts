import { test, expect } from '@playwright/test';

test.describe('Footer Links', () => {
  test('should not show privacy notice or imprint links when not configured', async ({
    page,
  }) => {
    // Mock config endpoint without privacy/imprint URLs
    await page.route('**/config', async route => {
      await route.fulfill({
        status: 200,
        json: {
          DISABLE_UPLOAD: false,
          PREFETCH_SECRET: true,
          DISABLE_FEATURES: false,
          NO_LANGUAGE_SWITCHER: false,
        },
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that footer exists but privacy/imprint links are not present
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(
      footer.locator('a:has-text("Datenschutzerklärung")'),
    ).not.toBeVisible();
    await expect(footer.locator('a:has-text("Impressum")')).not.toBeVisible();
  });

  test('should show only privacy notice link when configured', async ({
    page,
  }) => {
    // Mock config endpoint with only privacy notice URL
    await page.route('**/config', async route => {
      await route.fulfill({
        status: 200,
        json: {
          DISABLE_UPLOAD: false,
          PREFETCH_SECRET: true,
          DISABLE_FEATURES: false,
          NO_LANGUAGE_SWITCHER: false,
          PRIVACY_NOTICE_URL: 'https://example.com/privacy',
        },
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that privacy notice link is present
    const privacyLink = page.locator('a:has-text("Datenschutzerklärung")');
    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toHaveAttribute(
      'href',
      'https://example.com/privacy',
    );
    await expect(privacyLink).toHaveAttribute('target', '_blank');
    await expect(privacyLink).toHaveAttribute('rel', 'noopener noreferrer');

    // Check that imprint link is not present
    await expect(page.locator('a:has-text("Impressum")')).not.toBeVisible();

    // The links are followed by a bullet separator and the copyright
    const footerText = page.locator('footer div.flex.flex-wrap');
    await expect(footerText).toContainText('Datenschutzerklärung•© ');
  });

  test('should show only imprint link when configured', async ({ page }) => {
    // Mock config endpoint with only imprint URL
    await page.route('**/config', async route => {
      await route.fulfill({
        status: 200,
        json: {
          DISABLE_UPLOAD: false,
          PREFETCH_SECRET: true,
          DISABLE_FEATURES: false,
          NO_LANGUAGE_SWITCHER: false,
          IMPRINT_URL: 'https://example.com/imprint',
        },
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that imprint link is present
    const imprintLink = page.locator('a:has-text("Impressum")');
    await expect(imprintLink).toBeVisible();
    await expect(imprintLink).toHaveAttribute(
      'href',
      'https://example.com/imprint',
    );
    await expect(imprintLink).toHaveAttribute('target', '_blank');
    await expect(imprintLink).toHaveAttribute('rel', 'noopener noreferrer');

    // Check that privacy notice link is not present
    await expect(
      page.locator('a:has-text("Datenschutzerklärung")'),
    ).not.toBeVisible();

    // The links are followed by a bullet separator and the copyright
    const footerText = page.locator('footer div.flex.flex-wrap');
    await expect(footerText).toContainText('Impressum•© ');
  });

  test('should show both privacy notice and imprint links when both are configured', async ({
    page,
  }) => {
    // Mock config endpoint with both URLs
    await page.route('**/config', async route => {
      await route.fulfill({
        status: 200,
        json: {
          DISABLE_UPLOAD: false,
          PREFETCH_SECRET: true,
          DISABLE_FEATURES: false,
          NO_LANGUAGE_SWITCHER: false,
          PRIVACY_NOTICE_URL: 'https://example.com/privacy',
          IMPRINT_URL: 'https://example.com/imprint',
        },
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that both links are present
    const privacyLink = page.locator('a:has-text("Datenschutzerklärung")');
    const imprintLink = page.locator('a:has-text("Impressum")');

    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toHaveAttribute(
      'href',
      'https://example.com/privacy',
    );
    await expect(privacyLink).toHaveAttribute('target', '_blank');

    await expect(imprintLink).toBeVisible();
    await expect(imprintLink).toHaveAttribute(
      'href',
      'https://example.com/imprint',
    );
    await expect(imprintLink).toHaveAttribute('target', '_blank');

    // Check that both links are on the same line with bullet separators
    const footerText = page.locator('footer div.flex.flex-wrap');
    await expect(footerText).toContainText('Datenschutzerklärung•Impressum•© ');
  });

  test('should show footer links on all pages when configured', async ({
    page,
  }) => {
    // Mock config endpoint with both URLs
    await page.route('**/config', async route => {
      await route.fulfill({
        status: 200,
        json: {
          DISABLE_UPLOAD: false,
          PREFETCH_SECRET: true,
          DISABLE_FEATURES: false,
          NO_LANGUAGE_SWITCHER: false,
          PRIVACY_NOTICE_URL: 'https://example.com/privacy',
          IMPRINT_URL: 'https://example.com/imprint',
        },
      });
    });

    // Test on home page
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(
      page.locator('a:has-text("Datenschutzerklärung")'),
    ).toBeVisible();
    await expect(page.locator('a:has-text("Impressum")')).toBeVisible();

    // Test on upload page
    await page.goto('/#/upload');
    await page.waitForLoadState('networkidle');
    await expect(
      page.locator('a:has-text("Datenschutzerklärung")'),
    ).toBeVisible();
    await expect(page.locator('a:has-text("Impressum")')).toBeVisible();
  });

  test('should handle empty string URLs same as missing URLs', async ({
    page,
  }) => {
    // Mock config endpoint with empty string URLs
    await page.route('**/config', async route => {
      await route.fulfill({
        status: 200,
        json: {
          DISABLE_UPLOAD: false,
          PREFETCH_SECRET: true,
          DISABLE_FEATURES: false,
          NO_LANGUAGE_SWITCHER: false,
          PRIVACY_NOTICE_URL: '',
          IMPRINT_URL: '',
        },
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that links are not shown when URLs are empty strings
    await expect(
      page.locator('a:has-text("Datenschutzerklärung")'),
    ).not.toBeVisible();
    await expect(page.locator('a:has-text("Impressum")')).not.toBeVisible();
  });

  test('should show the FilmOrbit copyright and the Yopass attribution', async ({
    page,
  }) => {
    await page.route('**/config', async route => {
      await route.fulfill({
        status: 200,
        json: {
          DISABLE_UPLOAD: false,
          PREFETCH_SECRET: true,
          DISABLE_FEATURES: false,
          NO_LANGUAGE_SWITCHER: false,
        },
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const footer = page.locator('footer');
    const currentYear = await page.evaluate(() =>
      new Date().getFullYear().toString(),
    );
    await expect(footer).toContainText(`© ${currentYear} FilmOrbit`);
    await expect(footer.locator('a[href="https://filmorbit.de"]')).toHaveText(
      'FilmOrbit',
    );
    // Apache 2.0 attribution for the upstream project.
    const attribution = footer.locator(
      'a[href="https://github.com/jhaals/yopass"]',
    );
    await expect(attribution).toHaveText('basiert auf Yopass (Open Source)');
    await expect(attribution).toHaveAttribute('target', '_blank');
    await expect(footer.locator('a[href="https://yopass.se"]')).toHaveCount(0);
  });
});
