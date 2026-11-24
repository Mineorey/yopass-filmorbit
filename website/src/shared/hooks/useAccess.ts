import { useContext } from 'react';
import { AccessContext } from '@shared/context/accessContext';

export function useAccess() {
  return useContext(AccessContext);
}
