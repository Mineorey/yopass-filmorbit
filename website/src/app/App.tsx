import { useState } from 'react';
import FeaturesSection from '@shared/components/FeaturesSection';
import CreateSecret from '@features/CreateSecret';
import { Routes, Route, HashRouter } from 'react-router-dom';
import { useConfig } from '@shared/hooks/useConfig';
import { useAuth } from '@shared/hooks/useAuth';
import Navbar from '@shared/components/Navbar';
import Prefetcher from '@features/display-secret/Prefetcher';
import StreamingUpload from '@features/StreamingUpload';
import ReadOnlyLanding from '@features/ReadOnlyLanding';
import LoginRequired from '@features/LoginRequired';
import AccessGate from '@features/AccessGate';
import { useAccess } from '@shared/hooks/useAccess';
import { SpinnerIcon } from '@shared/components/icons';
import FilmOrbitFooter from '@shared/components/FilmOrbitFooter';
import CreateRequest from '@features/request-secret/CreateRequest';
import RequestList from '@features/request-secret/RequestList';
import RevealSecretModal, {
  type RevealedSecret,
} from '@features/request-secret/RevealSecretModal';
import { useCopy } from '@shared/hooks/useCopy';
import { downloadBlob } from '@shared/lib/download';
import ProvideSecret from '@features/request-secret/ProvideSecret';
import ReceiptList from '@features/receipts/ReceiptList';
import { useTranslation } from 'react-i18next';

export default function App() {
  const {
    DISABLE_UPLOAD,
    READ_ONLY,
    REQUIRE_AUTH,
    REQUIRE_AUTH_ALL,
    SECRET_REQUESTS,
    SECRET_REQUESTS_DRAINING,
    READ_RECEIPTS,
  } = useConfig();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const access = useAccess();
  const { t } = useTranslation();

  // The route can unmount while a one-time fetch is pending. Keep every
  // collected answer here until explicitly closed, without persisting content.
  const [revealQueue, setRevealQueue] = useState<RevealedSecret[]>([]);
  const revealed = revealQueue[0];
  const secret = useCopy();

  function reveal(item: RevealedSecret) {
    setRevealQueue(queue => [...queue, item]);
  }

  const [loginUnavailable, setLoginUnavailable] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('login_error')) {
      window.history.replaceState(
        {},
        '',
        window.location.pathname + window.location.hash,
      );
      return true;
    }
    return false;
  });

  // Whether creation pages must show the login gate instead of their content.
  const needsLogin = REQUIRE_AUTH && !authLoading && !isAuthenticated;
  // Whether creation pages must show the access password gate instead.
  const needsAccess = access.required && !access.loading && !access.granted;
  // While /access is still loading, show a spinner so the create form does not
  // flash before the gate replaces it.
  const accessPending = access.required && access.loading;
  const accessSpinner = (
    <div
      role="status"
      aria-label={t('display.loading')}
      className="flex justify-center py-16"
    >
      <SpinnerIcon className="animate-spin h-8 w-8 text-primary" />
    </div>
  );
  // With --require-auth-all, management pages are gated too.
  const needsLoginAll = REQUIRE_AUTH_ALL && needsLogin;
  // The login redirect lands on the home page, so the notice belongs there only.
  const loginAlert = loginUnavailable && (
    <div role="alert" className="alert alert-warning mb-6">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6 shrink-0 stroke-current"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <span>{t('auth.loginUnavailable')}</span>
      <button
        className="btn btn-sm btn-ghost"
        onClick={() => setLoginUnavailable(false)}
        aria-label={t('accessibility.dismiss')}
      >
        &times;
      </button>
    </div>
  );
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <button
        onClick={() => {
          const main = document.getElementById('main-content');
          main?.focus({ preventScroll: true });
          main?.scrollIntoView({ block: 'start' });
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:start-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-content focus:rounded-md"
      >
        {t('accessibility.skipToContent')}
      </button>
      <HashRouter>
        <Navbar />

        {/* Main Content */}
        <main
          id="main-content"
          tabIndex={-1}
          className="fo-container mb-auto py-12 sm:py-16 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body p-6 sm:p-10">
              <Routes>
                <Route
                  path="/"
                  element={
                    <>
                      {loginAlert}
                      {READ_ONLY ? (
                        <ReadOnlyLanding />
                      ) : needsLogin ? (
                        <LoginRequired />
                      ) : accessPending ? (
                        accessSpinner
                      ) : needsAccess ? (
                        <AccessGate />
                      ) : (
                        <CreateSecret />
                      )}
                    </>
                  }
                />
                {READ_ONLY ? (
                  <Route path="/upload" element={<ReadOnlyLanding />} />
                ) : needsLogin ? (
                  <Route path="/upload" element={<LoginRequired />} />
                ) : (
                  !DISABLE_UPLOAD && (
                    <Route
                      path="/upload"
                      element={
                        accessPending ? (
                          accessSpinner
                        ) : needsAccess ? (
                          <AccessGate />
                        ) : (
                          <StreamingUpload />
                        )
                      }
                    />
                  )
                )}
                {(SECRET_REQUESTS || SECRET_REQUESTS_DRAINING) && (
                  <>
                    {/* An expired license blocks new requests; a link to the
                        form shows the list and its notice instead. */}
                    <Route
                      path="/request"
                      element={
                        needsLoginAll || (SECRET_REQUESTS && needsLogin) ? (
                          <LoginRequired />
                        ) : !SECRET_REQUESTS ? (
                          <RequestList onReveal={reveal} />
                        ) : (
                          <CreateRequest />
                        )
                      }
                    />
                    <Route
                      path="/requests"
                      element={
                        needsLoginAll ? (
                          <LoginRequired />
                        ) : (
                          <RequestList onReveal={reveal} />
                        )
                      }
                    />
                    <Route path="/r/:key" element={<ProvideSecret />} />
                    <Route path="/r/:key/:fp" element={<ProvideSecret />} />
                  </>
                )}
                {READ_RECEIPTS && (
                  <Route
                    path="/receipts"
                    element={
                      needsLoginAll ? <LoginRequired /> : <ReceiptList />
                    }
                  />
                )}
                <Route
                  path="/:format/:key/:password"
                  element={<Prefetcher />}
                />
                <Route path="/:format/:key" element={<Prefetcher />} />
              </Routes>
            </div>
          </div>
          <FeaturesSection />
        </main>
        {revealed && (
          <RevealSecretModal
            key={revealed.id}
            secret={revealed.secret}
            file={revealed.file}
            undecrypted={revealed.undecrypted}
            copied={secret.isCopied(revealed.id)}
            onCopy={() => secret.copy(revealed.secret ?? '', revealed.id)}
            onDownload={() => {
              if (revealed.file) {
                downloadBlob(revealed.file.data, revealed.file.filename);
              }
            }}
            onClose={() => setRevealQueue(queue => queue.slice(1))}
          />
        )}
      </HashRouter>
      <FilmOrbitFooter />
    </div>
  );
}
