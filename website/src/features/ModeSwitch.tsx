/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useId,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@shared/hooks/useConfig';

// FilmOrbit Safe: segmented "Text | Datei" switch above the create card. It
// replaces upstream's navbar upload link and keeps the / and /upload routes.

// App renders the switch above the card while at least one create form is
// mounted and has rendered <ShowModeSwitch /> (so not on the result, the
// access gate or display pages). App owns the switch, so it stays mounted and
// keeps keyboard focus when the route changes from / to /upload.
export const ModeSwitchContext = createContext<Dispatch<
  SetStateAction<number>
> | null>(null);

export function ShowModeSwitch() {
  const setUsers = useContext(ModeSwitchContext);
  useEffect(() => {
    if (!setUsers) return;
    setUsers(n => n + 1);
    return () => setUsers(n => n - 1);
  }, [setUsers]);
  return null;
}

const OPTIONS = [
  {
    path: '/',
    label: 'filmorbit.modeText',
    icon: 'M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75',
  },
  {
    path: '/upload',
    label: 'filmorbit.modeFile',
    icon: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5',
  },
] as const;

export default function ModeSwitch() {
  const { DISABLE_UPLOAD, MAX_FILE_SIZE } = useConfig();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const name = useId();
  const hintId = useId();
  if (DISABLE_UPLOAD) return null;

  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div
        role="radiogroup"
        aria-label={t('filmorbit.modeSwitchLabel')}
        aria-describedby={hintId}
        className="flex w-full shrink-0 gap-1 rounded-full bg-base-100 p-1 shadow-[0_6px_24px_rgba(5,13,15,0.10)] sm:w-auto"
      >
        {OPTIONS.map(option => {
          const active = pathname === option.path;
          return (
            <label
              key={option.path}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent has-[:focus-visible]:outline sm:flex-none ${
                active
                  ? 'bg-primary text-primary-content'
                  : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'
              }`}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={active}
                onChange={() => navigate(option.path)}
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={option.icon}
                />
              </svg>
              {t(option.label)}
            </label>
          );
        })}
      </div>
      <p id={hintId} className="text-sm leading-snug text-white/85">
        {MAX_FILE_SIZE
          ? t('filmorbit.modeHint', { size: MAX_FILE_SIZE })
          : t('filmorbit.modeHintNoSize')}
      </p>
    </div>
  );
}
