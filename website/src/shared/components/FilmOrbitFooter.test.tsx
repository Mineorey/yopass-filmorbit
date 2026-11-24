import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultConfig, type Config } from '../lib/config';
import FilmOrbitFooter from './FilmOrbitFooter';

const state = vi.hoisted(() => ({ config: {} as Config }));
vi.mock('@shared/hooks/useConfig', () => ({ useConfig: () => state.config }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.config = { ...defaultConfig };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => root.render(<FilmOrbitFooter />));
}

it('links FilmOrbit and credits Yopass as the open source base', async () => {
  await render();
  expect(
    container.querySelector('a[href="https://filmorbit.de"]')!.textContent,
  ).toBe('FilmOrbit');
  expect(
    container.querySelector('a[href="https://github.com/jhaals/yopass"]')!
      .textContent,
  ).toBe('basiert auf Yopass (Open Source)');
  expect(container.textContent).not.toContain('footer.imprint');
  expect(container.textContent).not.toContain('footer.privacyNotice');
});

it('shows the configured imprint and privacy links', async () => {
  state.config = {
    ...defaultConfig,
    IMPRINT_URL: 'https://filmorbit.de/impressum',
    PRIVACY_NOTICE_URL: 'https://filmorbit.de/datenschutz',
  };
  await render();
  expect(
    container.querySelector('a[href="https://filmorbit.de/impressum"]')!
      .textContent,
  ).toBe('footer.imprint');
  expect(
    container.querySelector('a[href="https://filmorbit.de/datenschutz"]')!
      .textContent,
  ).toBe('footer.privacyNotice');
});
