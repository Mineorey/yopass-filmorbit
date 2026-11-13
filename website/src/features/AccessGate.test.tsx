import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '@shared/lib/i18n';
import AccessGate from './AccessGate';

const grant = vi.hoisted(() => vi.fn());
vi.mock('@shared/hooks/useAccess', () => ({
  useAccess: () => ({
    required: true,
    granted: false,
    loading: false,
    grant,
    revoke: vi.fn(),
  }),
}));

const fetchMock = vi.fn();
let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  await i18n.changeLanguage('de');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<AccessGate />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  fetchMock.mockReset();
  grant.mockReset();
  vi.unstubAllGlobals();
});

function input() {
  const label = Array.from(container.querySelectorAll('label')).find(
    l => l.textContent === 'Zugangspasswort',
  );
  expect(label).toBeDefined();
  const field = document.getElementById(label!.htmlFor) as HTMLInputElement;
  expect(field).not.toBeNull();
  return field;
}

async function typeAndEnter(value: string) {
  const field = input();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Enter in a single-field form triggers implicit submission in browsers;
  // jsdom does not simulate it, so submit the field's form directly.
  const form = field.form;
  expect(form).not.toBeNull();
  expect(form!.querySelector('button[type=submit]')).not.toBeNull();
  await act(async () => form!.requestSubmit());
}

function response(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

it('shows a password field and a submit button', () => {
  expect(input().type).toBe('password');
  const button = container.querySelector('button[type=submit]');
  expect(button?.textContent).toBe('Weiter');
  expect(container.textContent).toContain('Zugang für Kundinnen und Kunden');
  expect(container.textContent).toContain(
    'Diese Seite ist für Kundinnen und Kunden von FilmOrbit. Das Zugangspasswort bekommst du von uns.',
  );
});

it('posts the entered password to /access on enter', async () => {
  fetchMock.mockResolvedValue(response(204));
  await typeAndEnter('geheim');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/access');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual({ password: 'geheim' });
});

it('shows the invalid message on 401 and keeps the field', async () => {
  fetchMock.mockResolvedValue(
    response(401, { message: 'invalid access password' }),
  );
  await typeAndEnter('falsch');
  expect(container.textContent).toContain(
    'Das Passwort stimmt nicht. Bitte versuch es noch einmal.',
  );
  expect(input()).toBeDefined();
  expect(grant).not.toHaveBeenCalled();
});

it('shows the rate limit message on 429', async () => {
  fetchMock.mockResolvedValue(response(429));
  await typeAndEnter('falsch');
  expect(container.textContent).toContain(
    'Zu viele Versuche. Bitte warte ein paar Minuten.',
  );
  expect(grant).not.toHaveBeenCalled();
});

it('grants access on 204', async () => {
  fetchMock.mockResolvedValue(response(204));
  await typeAndEnter('geheim');
  expect(grant).toHaveBeenCalledTimes(1);
});
