import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultConfig, type Config } from '@shared/lib/config';
import Result from './Result';

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

async function render(customPassword: boolean) {
  await act(async () =>
    root.render(
      <Result
        password="key"
        uuid="uuid"
        prefix="s"
        customPassword={customPassword}
        oneTime
      />,
    ),
  );
}

it('tells to send the one-click link when the key was generated', async () => {
  await render(false);
  expect(container.textContent).toContain('filmorbit.nextTitle');
  expect(container.textContent).toContain('filmorbit.nextOneClick');
});

it('tells to send link and key separately without a one-click link', async () => {
  state.config = { ...defaultConfig, DISABLE_ONE_CLICK_LINK: true };
  await render(false);
  expect(container.textContent).toContain('filmorbit.nextSeparate');
  expect(container.textContent).not.toContain('filmorbit.nextOneClick');
});

it('tells to send a custom password through another channel', async () => {
  await render(true);
  expect(container.textContent).toContain('filmorbit.nextCustomPassword');
  expect(container.textContent).not.toContain('filmorbit.nextOneClick');
});
