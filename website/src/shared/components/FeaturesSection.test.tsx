import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultConfig, type Config } from '../lib/config';
import i18n from '../lib/i18n';
import FeaturesSection from './FeaturesSection';

const state = vi.hoisted(() => ({ config: {} as Config, responder: false }));
vi.mock('@shared/hooks/useConfig', () => ({ useConfig: () => state.config }));
vi.mock('@shared/hooks/useResponderPage', () => ({
  useResponderPage: () => state.responder,
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await i18n.changeLanguage('de');
  state.config = { ...defaultConfig, DISABLE_FEATURES: false };
  state.responder = false;
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
  await act(async () => root.render(<FeaturesSection />));
}

it('explains the three steps in German', async () => {
  await render();
  expect(container.querySelector('h2')!.textContent).toBe(
    'Zugangsdaten sicher an FilmOrbit schicken',
  );
  expect(container.querySelectorAll('ol > li')).toHaveLength(3);
  expect(container.textContent).toContain('in deinem Browser verschlüsselt');
  expect(container.textContent).not.toContain('Yopass');
});

it('renders four FAQ entries and mentions the 1 MB file limit', async () => {
  await render();
  const items = container.querySelectorAll('details');
  expect(items).toHaveLength(4);
  const questions = [...items].map(
    d => d.querySelector('summary')!.textContent,
  );
  expect(questions).toContain('Kann ich auch Dateien schicken?');
  expect(items[3].textContent).toContain('1 MB');
});

it('renders nothing when features are disabled', async () => {
  state.config = { ...defaultConfig, DISABLE_FEATURES: true };
  await render();
  expect(container.innerHTML).toBe('');
});
