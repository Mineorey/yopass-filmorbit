import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultConfig, type Config } from '../lib/config';
import { ThemeProvider } from '../theme/ThemeProvider';
import Navbar from './Navbar';

const state = vi.hoisted(() => ({ config: {} as Config }));
vi.mock('../hooks/useConfig', () => ({ useConfig: () => state.config }));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('./SettingsMenu', () => ({ default: () => null }));

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
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ThemeProvider>
          <Navbar />
        </ThemeProvider>
      </MemoryRouter>,
    );
  });
  return container.querySelector<HTMLAnchorElement>('a[href="/"]')!;
}

it('shows the FilmOrbit logo linking to filmorbit.de and the app name', async () => {
  const home = await render();
  expect(home.textContent).toBe('FilmOrbit Safe');
  const site = container.querySelector<HTMLAnchorElement>(
    'a[href="https://filmorbit.de"]',
  )!;
  const image = site.querySelector('img')!;
  expect(image.getAttribute('src')).toBe('/filmorbit-logo.png');
  expect(image.alt).toBe('FilmOrbit');
  expect(container.textContent).not.toContain('Yopass');
});

it('ignores the license-gated logo and app name options', async () => {
  state.config = {
    ...defaultConfig,
    LOGO_URL: '/custom.svg',
    APP_NAME: 'Acme Secrets',
    HIDE_APP_NAME: true,
  };
  const home = await render();
  expect(home.textContent).toBe('FilmOrbit Safe');
  expect(container.querySelector('img[src="/custom.svg"]')).toBeNull();
  expect(container.querySelector('img')!.getAttribute('src')).toBe(
    '/filmorbit-logo.png',
  );
});

it('keeps existing requests accessible while an expired license drains', async () => {
  state.config.SECRET_REQUESTS = false;
  state.config.SECRET_REQUESTS_DRAINING = true;
  await render();
  expect(container.querySelector('a[href="#/requests"]')).not.toBeNull();
});

it('has no upload link (the text/file switch sits above the card)', async () => {
  await render();
  expect(container.querySelector('a[href="#/upload"]')).toBeNull();
  expect(container.textContent).not.toContain('header.buttonUpload');
});
