import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { submitAccessPassword, type AccessResult } from '@shared/lib/api';
import { useAccess } from '@shared/hooks/useAccess';
import { LockIcon } from '@shared/components/icons';

export default function AccessGate() {
  const { t } = useTranslation();
  const { grant } = useAccess();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<Exclude<AccessResult, 'ok'> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const result = await submitAccessPassword(password);
    setSubmitting(false);
    if (result === 'ok') {
      grant();
      return;
    }
    setError(result);
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-6 py-8">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
        <LockIcon className="h-8 w-8 text-primary" />
      </div>

      <div className="text-center space-y-4 max-w-2xl w-full">
        <h1 className="text-3xl font-medium tracking-tight text-base-content">
          {t('access.title')}
        </h1>
        <p className="text-lg text-base-content/70">
          {t('access.description')}
        </p>
        <form onSubmit={onSubmit} className="max-w-sm mx-auto text-start">
          <label className="label" htmlFor="accessPassword">
            <span className="label-text font-medium">
              {t('access.passwordLabel')}
            </span>
          </label>
          <input
            id="accessPassword"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            className="input input-bordered w-full focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={password}
            onChange={e => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'accessPasswordError' : undefined}
          />
          {error && (
            <p
              id="accessPasswordError"
              role="alert"
              className="text-error text-sm mt-2"
            >
              {t(
                error === 'rate_limited'
                  ? 'access.rateLimited'
                  : error === 'error'
                    ? 'access.error'
                    : 'access.invalid',
              )}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary w-full mt-4"
            disabled={submitting}
          >
            {t('access.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
