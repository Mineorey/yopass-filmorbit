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
