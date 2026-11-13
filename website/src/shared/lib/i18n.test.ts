import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('fixed German language', () => {
  it.each(['en-US', 'sv-SE', 'he-IL', 'ar-SA'])(
    'ignores the browser language %s',
    async browser => {
      vi.spyOn(navigator, 'languages', 'get').mockReturnValue([browser]);
      const { default: i18n } = await import('./i18n');
      expect(i18n.resolvedLanguage).toBe('de');
      expect(document.documentElement.lang).toBe('de');
      expect(document.documentElement.dir).toBe('ltr');
    },
  );

  it('ignores a language saved in localStorage', async () => {
    localStorage.setItem('i18nextLng', 'en');
    const { default: i18n } = await import('./i18n');
    expect(i18n.resolvedLanguage).toBe('de');
  });
});

describe('plural forms', () => {
  it.each([
    ['de', 1, '1 Geheimnis wartet auf Abholung'],
    ['de', 2, '2 Geheimnisse warten auf Abholung'],
    ['en', 1, '1 secret waiting to be collected'],
    ['en', 2, '2 secrets waiting to be collected'],
    ['ru', 1, '1 секрет ожидает получения'],
    ['ru', 2, '2 секрета ожидают получения'],
    ['ru', 5, '5 секретов ожидают получения'],
    ['ru', 21, '21 секрет ожидает получения'],
    ['he', 2, 'שני סודות ממתינים לאיסוף'],
  ])('%s renders count %i', async (language, count, expected) => {
    const { default: i18n } = await import('./i18n');
    expect(i18n.t('header.requestsWithCount', { lng: language, count })).toBe(
      expected,
    );
  });
});
