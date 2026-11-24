import { test, expect, type Page } from '@playwright/test';
import { MockAPI } from './helpers/mock-api';
import { mockResponses } from './helpers/test-data';

// FilmOrbit Safe: the "Text | Datei" switch above the create card replaces
// upstream's navbar upload link.
function modeSwitch(page: Page) {
  return page.getByRole('radiogroup', { name: 'Was möchtest du senden?' });
}

function option(page: Page, name: 'Text' | 'Datei') {
  return modeSwitch(page).getByRole('radio', { name, exact: true });
}

function optionLabel(page: Page, name: 'Text' | 'Datei') {
  return modeSwitch(page).locator('label', { hasText: name });
}

test.describe('Mode Switch', () => {
  let mockAPI: MockAPI;

  test.beforeEach(async ({ page }) => {
    mockAPI = new MockAPI(page);
    await mockAPI.mockConfigEndpoint();
  });

  test.afterEach(async () => {
    await mockAPI.clearAllMocks();
  });

  test('shows the switch with Text active on the home page', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(modeSwitch(page)).toBeVisible();
    await expect(option(page, 'Text')).toBeChecked();
    await expect(option(page, 'Datei')).not.toBeChecked();
    await expect(optionLabel(page, 'Text')).toHaveClass(/bg-primary/);
    await expect(
      page.getByText('Text: Passwörter, API-Schlüssel, Zugangsdaten'),
    ).toBeVisible();
    // The navbar no longer carries an upload link.
    await expect(page.locator('header a[href="#/upload"]')).toHaveCount(0);
  });

  test('shows the switch with Datei active on the upload page', async ({
    page,
  }) => {
    await page.goto('/#/upload');
    await expect(page.locator('h2:has-text("Datei hochladen")')).toBeVisible();
    await expect(option(page, 'Datei')).toBeChecked();
    await expect(optionLabel(page, 'Datei')).toHaveClass(/bg-primary/);
  });

  test('switches between text and file by click', async ({ page }) => {
    await page.goto('/');
    await optionLabel(page, 'Datei').click();
    await expect(page).toHaveURL(/#\/upload$/);
    await expect(page.locator('h2:has-text("Datei hochladen")')).toBeVisible();
    await expect(option(page, 'Datei')).toBeChecked();

    await optionLabel(page, 'Text').click();
    await expect(
      page.locator('h2:has-text("Nachricht verschlüsseln")'),
    ).toBeVisible();
    await expect(option(page, 'Text')).toBeChecked();
  });

  test('switches by keyboard and keeps focus on the switch', async ({
    page,
  }) => {
    await page.goto('/');
    await option(page, 'Text').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('h2:has-text("Datei hochladen")')).toBeVisible();
    await expect(option(page, 'Datei')).toBeChecked();
    await expect(option(page, 'Datei')).toBeFocused();
  });

  test('follows browser back and forward', async ({ page }) => {
    await page.goto('/');
    await expect(option(page, 'Text')).toBeChecked();
    await page.goto('/#/upload');
    await expect(option(page, 'Datei')).toBeChecked();
    await page.goBack();
    await expect(option(page, 'Text')).toBeChecked();
    await page.goForward();
    await expect(option(page, 'Datei')).toBeChecked();
  });

  test('is hidden when uploads are disabled', async ({ page }) => {
    await mockAPI.mockConfigEndpoint({ DISABLE_UPLOAD: true });
    await page.goto('/');
    await expect(
      page.locator('h2:has-text("Nachricht verschlüsseln")'),
    ).toBeVisible();
    await expect(modeSwitch(page)).toHaveCount(0);
  });

  test('is hidden on the result page', async ({ page }) => {
    await mockAPI.mockCreateSecret(mockResponses.secretCreated);
    await page.goto('/');
    await expect(modeSwitch(page)).toBeVisible();
    await page.fill('textarea#secret', 'geheim');
    await page.click('button[type="submit"]');
    await expect(
      page.locator('h2:has-text("Geheimnis sicher gespeichert")'),
    ).toBeVisible();
    await expect(page.getByText('Und jetzt?')).toBeVisible();
    await expect(modeSwitch(page)).toHaveCount(0);
  });

  test('is hidden on display pages', async ({ page }) => {
    await page.goto('/#/s/some-id/some-key');
    await expect(page.locator('main')).toBeVisible();
    await expect(modeSwitch(page)).toHaveCount(0);
  });
});
