import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { ExpirationSelector } from './ExpirationSelector';
import { useConfig } from '@shared/hooks/useConfig';

type SecretFormFields = {
  expiration: string;
  oneTime: boolean;
  generateKey: boolean;
  customPassword: string;
};

interface SecretOptionsProps<T extends SecretFormFields> {
  register: UseFormRegister<T>;
  setValue: UseFormSetValue<T>;
  oneTime: boolean;
  setOneTime: (value: boolean) => void;
  generateKey: boolean;
  setGenerateKey: (value: boolean) => void;
  customPassword: string;
  setCustomPassword: (value: string) => void;
  requireAuth: boolean;
  setRequireAuth: (value: boolean) => void;
  readReceipt?: boolean;
  setReadReceipt?: (value: boolean) => void;
  expirationLabel?: string;
  expiration: string;
}

export function SecretOptions<T extends SecretFormFields>({
  register: registerProp,
  setValue: setValueProp,
  oneTime,
  setOneTime,
  generateKey,
  setGenerateKey,
  customPassword,
  setCustomPassword,
  requireAuth,
  setRequireAuth,
  readReceipt,
  setReadReceipt,
  expirationLabel,
  expiration,
}: SecretOptionsProps<T>) {
  const register = registerProp as unknown as UseFormRegister<SecretFormFields>;
  const setValue = setValueProp as unknown as UseFormSetValue<SecretFormFields>;
  const { t } = useTranslation();
  const config = useConfig();
  // FilmOrbit Safe: ids for the short explanations under each option.
  const helpId = useId();
  const helpClass = 'ps-11 pe-2 -mt-1 text-sm text-base-content/70';

  return (
    <>
      <ExpirationSelector
        value={expiration}
        onChange={value => setValue('expiration', value)}
        legend={expirationLabel}
      />
      <p className="mt-2 text-sm text-base-content/70">
        {t('filmorbit.helpExpiration')}
      </p>

      <div className="mt-6 space-y-3">
        {!config?.FORCE_ONETIME_SECRETS && (
          <div>
            <label className="cursor-pointer flex items-center space-x-3 p-2 rounded-field hover:bg-base-200 transition-colors">
              <input
                type="checkbox"
                className="checkbox checkbox-primary"
                aria-describedby={`${helpId}-oneTime`}
                {...register('oneTime')}
                checked={oneTime}
                onChange={() => setOneTime(!oneTime)}
              />
              <span className="label-text font-medium">
                {t('create.inputOneTimeLabel')}
              </span>
            </label>
            <p id={`${helpId}-oneTime`} className={helpClass}>
              {t('filmorbit.helpOneTime')}
            </p>
          </div>
        )}
        <div>
          <label className="cursor-pointer flex items-center space-x-3 p-2 rounded-field hover:bg-base-200 transition-colors">
            <input
              type="checkbox"
              className="checkbox checkbox-primary"
              aria-describedby={`${helpId}-generateKey`}
              {...register('generateKey')}
              checked={generateKey}
              onChange={() => setGenerateKey(!generateKey)}
            />
            <span className="label-text font-medium">
              {t('create.inputGenerateKeyLabel')}
            </span>
          </label>
          <p id={`${helpId}-generateKey`} className={helpClass}>
            {t('filmorbit.helpGenerateKey')}
          </p>
        </div>
        {config?.OIDC_ENABLED && (
          <label className="cursor-pointer flex items-center space-x-3 p-2 rounded-field hover:bg-base-200 transition-colors">
            <input
              type="checkbox"
              className="checkbox checkbox-primary"
              checked={requireAuth}
              onChange={() => setRequireAuth(!requireAuth)}
            />
            <span className="label-text font-medium">
              {t('create.inputRequireAuthLabel')}
            </span>
          </label>
        )}
        {config?.READ_RECEIPTS && setReadReceipt && (
          <label className="cursor-pointer flex items-center space-x-3 p-2 rounded-field hover:bg-base-200 transition-colors">
            <input
              type="checkbox"
              className="checkbox checkbox-primary"
              checked={readReceipt}
              onChange={() => setReadReceipt(!readReceipt)}
            />
            <span className="label-text font-medium">
              {t('create.inputReadReceiptLabel')}
            </span>
          </label>
        )}
      </div>

      {!generateKey && (
        <div className="mt-4">
          <label className="label" htmlFor="customPassword">
            <span className="label-text font-medium">
              {t('create.inputCustomPasswordLabel')}
            </span>
          </label>
          <input
            id="customPassword"
            type="password"
            autoComplete="new-password"
            aria-describedby={`${helpId}-customPassword`}
            {...register('customPassword')}
            className="input input-bordered w-full focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={customPassword}
            onChange={e => setCustomPassword(e.target.value)}
            placeholder={t('create.inputCustomPasswordPlaceholder')}
          />
          <p
            id={`${helpId}-customPassword`}
            className="mt-2 text-sm text-base-content/70"
          >
            {t('filmorbit.helpCustomPassword')}
          </p>
        </div>
      )}
    </>
  );
}
