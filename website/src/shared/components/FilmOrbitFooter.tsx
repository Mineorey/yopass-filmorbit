import { useTranslation } from 'react-i18next';
import { useConfig } from '@shared/hooks/useConfig';

// The footer sits directly on the page gradient, so its text is white.
const linkClass =
  'text-white underline underline-offset-4 decoration-white/60 hover:decoration-white transition-colors duration-200';

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
    <footer className="border-t border-white/20">
      <div className="fo-container py-8">
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
              <span className="text-white/60" aria-hidden="true">
                •
              </span>
            </span>
          ))}
          <span className="text-white/85">
            &copy; {new Date().getFullYear()}{' '}
            <a
              href="https://filmorbit.de"
              className={`font-medium ${linkClass}`}
            >
              FilmOrbit
            </a>
          </span>
          <span className="text-white/60" aria-hidden="true">
            •
          </span>
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
