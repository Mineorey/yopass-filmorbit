import { test, expect, Page } from '@playwright/test';
import { MockAPI } from './helpers/mock-api';

// The mixed line would end up with its ! on the left under per-line direction.
const lines = ['סיסמה ראשית', '123-456!', 'passw0rd!', '(admin)', 'סיסמה123!'];
const secret = lines.join('\n');
const id = '11111111-2222-3333-4444-555555555555';

// FilmOrbit forces German on every page load and ignores a saved language,
// so switch at runtime through the settings menu instead.
async function setLanguage(page: Page, language: string) {
  await page.click('[data-testid="settings-menu-button"]');
  await page.selectOption('#settings-language', language);
  await page.keyboard.press('Escape');
}

// Horizontal position of the first and last character of each line.
function lineEdges(element: Element) {
  const node = element.firstChild as Text;
  const range = document.createRange();
  function left(i: number) {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    return range.getBoundingClientRect().left;
  }
  let offset = 0;
  return node.data.split('\n').map(line => {
    const edges = { first: left(offset), last: left(offset + line.length - 1) };
    offset += line.length + 1;
    return edges;
  });
}

test.describe('Secret text direction', () => {
  for (const [sender, recipient] of [
    ['en', 'en'],
    ['he', 'he'],
    ['he', 'en'],
    ['en', 'he'],
  ]) {
    test(`is unchanged from ${sender} sender to ${recipient} recipient`, async ({
      page,
    }) => {
      let message = '';
      await new MockAPI(page).mockConfigEndpoint();
      await page.route('**/secret', async route => {
        message = route.request().postDataJSON().message;
        await route.fulfill({ json: { message: id } });
      });
      await page.route(`**/secret/${id}`, route =>
        route.fulfill({ json: { message, one_time: false } }),
      );
      await page.route(`**/secret/${id}/status`, route =>
        route.fulfill({ json: { oneTime: false } }),
      );

      await page.goto('/');
      await setLanguage(page, sender);
      const input = page.locator('#secret');
      // The placeholder is page text and follows the page; content does not.
      await expect(input).toHaveCSS(
        'direction',
        sender === 'he' ? 'rtl' : 'ltr',
      );
      await input.fill(secret);
      const typed = await input.evaluate(e => {
        const { direction, unicodeBidi } = getComputedStyle(e);
        return { direction, unicodeBidi };
      });
      await page.locator('form button[type=submit]').click();
      const link = await page.locator('code').first().textContent();

      await page.goto(link!);
      await page.reload();
      const shown = page.getByTestId('decrypted-secret');
      await expect(shown).toHaveText(secret, { useInnerText: true });
      await setLanguage(page, recipient);
      await expect(page.locator('html')).toHaveAttribute(
        'dir',
        recipient === 'he' ? 'rtl' : 'ltr',
      );

      expect(
        await shown.evaluate(e => {
          const { direction, unicodeBidi } = getComputedStyle(e);
          return { direction, unicodeBidi };
        }),
      ).toEqual(typed);
      expect(typed.direction).toBe('ltr');

      const [hebrew, ...others] = await shown.evaluate(lineEdges);
      expect(hebrew.first).toBeGreaterThan(hebrew.last);
      for (const line of others) {
        expect(line.first).toBeLessThan(line.last);
      }
    });
  }
});
