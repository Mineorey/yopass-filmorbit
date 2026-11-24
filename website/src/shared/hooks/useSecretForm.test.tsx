import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccessContext } from '@shared/context/accessContext';
import { ConfigContext } from '@shared/context/configContext';
import { defaultConfig } from '@shared/lib/config';
import { useSecretForm, type SecretFormState } from './useSecretForm';

const revoke = vi.fn();
let form: SecretFormState;
let root: Root;
let container: HTMLDivElement;

function Probe() {
  const state = useSecretForm();
  useEffect(() => {
    form = state;
  });
  return null;
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () =>
    root.render(
      <ConfigContext.Provider value={defaultConfig}>
        <AccessContext.Provider
          value={{
            required: true,
            granted: true,
            loading: false,
            grant: vi.fn(),
            revoke,
          }}
        >
          <Probe />
        </AccessContext.Provider>
      </ConfigContext.Provider>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  revoke.mockReset();
  vi.unstubAllGlobals();
});

it('revokes access when creation reports a missing access cookie', () => {
  expect(form.handleAccessDenied(401, 'access password required')).toBe(true);
  expect(revoke).toHaveBeenCalledTimes(1);
});

it('leaves other creation errors alone', () => {
  expect(form.handleAccessDenied(401, 'HTTP 401')).toBe(false);
  expect(form.handleAccessDenied(500, 'access password required')).toBe(false);
  expect(revoke).not.toHaveBeenCalled();
});
