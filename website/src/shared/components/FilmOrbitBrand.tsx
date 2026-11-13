// FilmOrbit Safe branding for the navbar: the FilmOrbit logo leads back to the
// agency site, the app name to the start page. Hardcoded in the fork instead of
// the license-gated LOGO_URL / APP_NAME options.
const FILMORBIT_SITE_URL = 'https://filmorbit.de';
const APP_NAME = 'FilmOrbit Safe';

export default function FilmOrbitBrand() {
  return (
    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
      <a
        href={FILMORBIT_SITE_URL}
        className="shrink-0 rounded-field px-1 py-1 transition-opacity duration-200 hover:opacity-80"
        title="filmorbit.de"
      >
        <img
          src="/filmorbit-logo.png"
          alt="FilmOrbit"
          width={138}
          height={32}
          className="h-6 w-auto sm:h-8"
        />
      </a>
      <span aria-hidden="true" className="h-6 w-px shrink-0 bg-base-300" />
      <a
        href="/"
        className="truncate font-display text-lg sm:text-xl leading-none uppercase text-base-content hover:text-primary transition-colors duration-200"
      >
        {APP_NAME}
      </a>
    </div>
  );
}
