import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultConfig, type Config } from '@shared/lib/config';
import ModeSwitch, { ModeSwitchContext, ShowModeSwitch } from './ModeSwitch';

const state = vi.hoisted(() => ({ config: {} as Config }));
vi.mock('@shared/hooks/useConfig', () => ({ useConfig: () => state.config }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
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

function Path() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

async function render(path = '/') {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ModeSwitch />
        <Path />
      </MemoryRouter>,
    ),
  );
}

function radios() {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type=radio]'),
  );
}

function path() {
  return container.querySelector('[data-testid="path"]')!.textContent;
}

it('renders a labelled radiogroup with the text and file options', async () => {
  await render();
  const group = container.querySelector('[role="radiogroup"]')!;
  expect(group.getAttribute('aria-label')).toBe('filmorbit.modeSwitchLabel');
  expect(radios()).toHaveLength(2);
  const labels = Array.from(group.querySelectorAll('label')).map(
    label => label.textContent,
  );
  expect(labels).toEqual(['filmorbit.modeText', 'filmorbit.modeFile']);
});

it('marks the option of the current route as active', async () => {
  await render('/upload');
  const [text, file] = radios();
  expect(text.checked).toBe(false);
  expect(file.checked).toBe(true);
  expect(file.closest('label')!.className).toContain('bg-primary');
  expect(text.closest('label')!.className).not.toContain('bg-primary');
});

it('navigates between / and /upload', async () => {
  await render();
  expect(path()).toBe('/');
  await act(async () => radios()[1].click());
  expect(path()).toBe('/upload');
  expect(radios()[1].checked).toBe(true);
  await act(async () => radios()[0].click());
  expect(path()).toBe('/');
});

it('shows the helper line with the configured maximum file size', async () => {
  state.config = { ...defaultConfig, MAX_FILE_SIZE: '1MB' };
  await render();
  const group = container.querySelector('[role="radiogroup"]')!;
  const hint = document.getElementById(
    group.getAttribute('aria-describedby')!,
  )!;
  expect(hint.textContent).toBe('filmorbit.modeHint:{"size":"1MB"}');
});

it('falls back to the helper line without a size', async () => {
  state.config = { ...defaultConfig, MAX_FILE_SIZE: undefined };
  await render();
  expect(container.textContent).toContain('filmorbit.modeHintNoSize');
});

it('renders nothing when uploads are disabled', async () => {
  state.config = { ...defaultConfig, DISABLE_UPLOAD: true };
  await render();
  expect(container.querySelector('[role="radiogroup"]')).toBeNull();
  expect(container.textContent).toBe('/');
});

it('counts the mounted forms that ask for the switch', async () => {
  function Host({ show }: { show: boolean }) {
    const [count, setCount] = useState(0);
    return (
      <ModeSwitchContext.Provider value={setCount}>
        <output data-testid="count">{count}</output>
        {show && <ShowModeSwitch />}
      </ModeSwitchContext.Provider>
    );
  }
  function count() {
    return container.querySelector('[data-testid="count"]')!.textContent;
  }
  await act(async () => root.render(<Host show />));
  expect(count()).toBe('1');
  await act(async () => root.render(<Host show={false} />));
  expect(count()).toBe('0');
});
