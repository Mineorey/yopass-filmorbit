import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfig } from '@shared/hooks/useConfig';
import { getAccessStatus } from '@shared/lib/api';
import { AccessContext } from './accessContext';

// Tracks whether the shared access password was entered (HttpOnly cookie).
export function AccessProvider({ children }: { children: React.ReactNode }) {
  const { ACCESS_PASSWORD_REQUIRED } = useConfig();
  const [loading, setLoading] = useState(ACCESS_PASSWORD_REQUIRED);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!ACCESS_PASSWORD_REQUIRED) return;
    let active = true;
    getAccessStatus().then(value => {
      if (!active) return;
      setGranted(value);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [ACCESS_PASSWORD_REQUIRED]);

  const grant = useCallback(() => setGranted(true), []);
  const revoke = useCallback(() => setGranted(false), []);
  const value = useMemo(
    () => ({
      required: ACCESS_PASSWORD_REQUIRED,
      granted,
      loading,
      grant,
      revoke,
    }),
    [ACCESS_PASSWORD_REQUIRED, granted, loading, grant, revoke],
  );

  return (
    <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
  );
}
