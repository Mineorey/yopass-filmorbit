import { useTranslation } from 'react-i18next';
import { useConfig } from '@shared/hooks/useConfig';

const linkClass =
  'text-base-content/70 hover:text-primary transition-colors duration-200 underline decoration-dotted underline-offset-4 hover:decoration-solid';

// FilmOrbit Safe footer: imprint and privacy links (--imprint-url,
// --privacy-notice-url), a link back to filmorbit.de and the Yopass
// attribution required by its Apache 2.0 license.
export default function FilmOrbitFooter() {
  const { PRIVACY_NOTICE_URL, IMPRINT_URL } = useConfig();
  const { t } = useTranslation();
  const links = [
    { url: PRIVACY_NOTICE_URL, label: t('footer.privacyNotice') },
    { url: IMPRINT_URL, label: t('footer.imprint') },
  ].filter(link => link.url?.trim());

  return (
    <footer className="bg-base-100 border-t border-base-300">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm">
          {links.map(link => (
            <span key={link.label} className="flex items-center gap-2">
              <a
                href={link.url}
                className={linkClass}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
              <span className="text-base-content/40">•</span>
            </span>
          ))}
          <span className="text-base-content/70">
            &copy; {new Date().getFullYear()}{' '}
            <a
              href="https://filmorbit.de"
              className="font-medium text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              FilmOrbit
            </a>
          </span>
          <span className="text-base-content/40">•</span>
          <a
            href="https://github.com/jhaals/yopass"
            className={linkClass}
            target="_blank"
            rel="noopener noreferrer"
          >
            basiert auf Yopass (Open Source)
          </a>
        </div>
      </div>
    </footer>
  );
}
