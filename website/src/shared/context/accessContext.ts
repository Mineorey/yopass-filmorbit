import { createContext } from 'react';

export interface AccessState {
  required: boolean;
  granted: boolean;
  loading: boolean;
  grant(): void;
  revoke(): void;
}

// Without a provider nothing is gated.
export const AccessContext = createContext<AccessState>({
  required: false,
  granted: true,
  loading: false,
  grant: () => {},
  revoke: () => {},
});
