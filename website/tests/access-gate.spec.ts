import { test, expect, Page } from '@playwright/test';
import { MockAPI } from './helpers/mock-api';
import { mockResponses } from './helpers/test-data';

// FilmOrbit Safe: creating a secret requires the shared access password.
// POST /access returns 204 and sets the yopass_access cookie, 401 on a wrong
// password, 429 when rate limited. GET /access reports {granted}.

async function mockAccess(page: Page, password: string) {
  let granted = false;
  const posts: unknown[] = [];
  await page.route('**/access', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { granted } });
      return;
    }
    const body = request.postDataJSON();
    posts.push(body);
    if (body.password === password) {
      granted = true;
      await route.fulfill({
        status: 204,
        headers: { 'set-cookie': 'yopass_access=ok; Path=/; HttpOnly' },
      });
      return;
    }
    await route.fulfill({
      status: 401,
      json: { message: 'invalid access password' },
    });
  });
  return posts;
}

test.describe('Access gate', () => {
  test('asks for the access password before showing the form', async ({
    page,
  }) => {
    const mockAPI = new MockAPI(page);
    await mockAPI.mockConfigEndpoint({ ACCESS_PASSWORD_REQUIRED: true });
    const posts = await mockAccess(page, 'richtig');
    await mockAPI.mockCreateSecret(mockResponses.secretCreated);

    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Zugang für Kundinnen und Kunden' }),
    ).toBeVisible();
    await expect(page.locator('#secret')).toHaveCount(0);

    const field = page.getByLabel('Zugangspasswort');
    await field.fill('falsch');
    await field.press('Enter');
    await expect(page.getByRole('alert')).toContainText(
      'Das Passwort stimmt nicht',
    );

    await field.fill('richtig');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await expect(
      page.locator('h2:has-text("Nachricht verschlüsseln")'),
    ).toBeVisible();
    expect(posts).toEqual([{ password: 'falsch' }, { password: 'richtig' }]);

    // The decryption password must not be autofilled with the saved
    // access password.
    await page
      .getByRole('checkbox', { name: 'Entschlüsselungsschlüssel generieren' })
      .uncheck();
    await expect(page.locator('#customPassword')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
    await page
      .getByRole('checkbox', { name: 'Entschlüsselungsschlüssel generieren' })
      .check();

    await page.locator('#secret').fill('API-Schlüssel');
    await page.locator('button[type="submit"]').click();
    await expect(
      page.locator('h2:has-text("Geheimnis sicher gespeichert")'),
    ).toBeVisible();
  });

  test('skips the gate when access was already granted', async ({ page }) => {
    const mockAPI = new MockAPI(page);
    await mockAPI.mockConfigEndpoint({ ACCESS_PASSWORD_REQUIRED: true });
    await page.route('**/access', route =>
      route.fulfill({ json: { granted: true } }),
    );
    await page.goto('/');
    await expect(
      page.locator('h2:has-text("Nachricht verschlüsseln")'),
    ).toBeVisible();
  });

  test('shows the gate again when the access cookie has expired', async ({
    page,
  }) => {
    const mockAPI = new MockAPI(page);
    await mockAPI.mockConfigEndpoint({ ACCESS_PASSWORD_REQUIRED: true });
    await page.route('**/access', route =>
      route.fulfill({ json: { granted: true } }),
    );
    await page.route('**/secret', route =>
      route.fulfill({
        status: 401,
        json: { message: 'access password required' },
      }),
    );
    await page.goto('/');
    await page.locator('#secret').fill('API-Schlüssel');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByLabel('Zugangspasswort')).toBeVisible();
  });

  test('shows no gate when no access password is configured', async ({
    page,
  }) => {
    await new MockAPI(page).mockConfigEndpoint();
    await page.goto('/');
    await expect(
      page.locator('h2:has-text("Nachricht verschlüsseln")'),
    ).toBeVisible();
    await expect(page.getByLabel('Zugangspasswort')).toHaveCount(0);
  });
});
