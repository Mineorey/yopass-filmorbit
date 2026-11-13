import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { defaultConfig, type Config } from '@shared/lib/config';
import { SecretOptions } from './SecretOptions';

const state = vi.hoisted(() => ({ config: {} as Config }));
vi.mock('@shared/hooks/useConfig', () => ({ useConfig: () => state.config }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'de' },
  }),
}));

type Fields = {
  expiration: string;
  oneTime: boolean;
  generateKey: boolean;
  customPassword: string;
};

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

async function render(generateKey = true) {
  function noop() {}
  const register = ((name: string) => ({
    name,
    onChange: async () => {},
    onBlur: async () => {},
    ref: noop,
  })) as unknown as UseFormRegister<Fields>;
  await act(async () =>
    root.render(
      <SecretOptions<Fields>
        register={register}
        setValue={noop as unknown as UseFormSetValue<Fields>}
        oneTime
        setOneTime={noop}
        generateKey={generateKey}
        setGenerateKey={noop}
        customPassword=""
        setCustomPassword={noop}
        requireAuth={false}
        setRequireAuth={noop}
        expiration="3600"
      />,
    ),
  );
}

function description(input: Element) {
  return document.getElementById(input.getAttribute('aria-describedby')!)!
    .textContent;
}

function checkbox(label: string) {
  return Array.from(container.querySelectorAll('label'))
    .find(element => element.textContent === label)!
    .querySelector('input')!;
}

it('explains the expiry, one-time and generated key options', async () => {
  await render();
  expect(container.textContent).toContain('filmorbit.helpExpiration');
  expect(description(checkbox('create.inputOneTimeLabel'))).toBe(
    'filmorbit.helpOneTime',
  );
  expect(description(checkbox('create.inputGenerateKeyLabel'))).toBe(
    'filmorbit.helpGenerateKey',
  );
  expect(container.textContent).not.toContain('filmorbit.helpCustomPassword');
});

it('tells to send a custom password through another channel', async () => {
  await render(false);
  const input = container.querySelector('#customPassword')!;
  expect(description(input)).toBe('filmorbit.helpCustomPassword');
});

it('omits the one-time explanation when one-time secrets are forced', async () => {
  state.config = { ...defaultConfig, FORCE_ONETIME_SECRETS: true };
  await render();
  expect(container.textContent).not.toContain('filmorbit.helpOneTime');
  expect(container.textContent).toContain('filmorbit.helpGenerateKey');
});
