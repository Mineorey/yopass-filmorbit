# FilmOrbit Safe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Yopass-Fork „FilmOrbit Safe“ unter `safe.filmorbit.de`: Zugangspasswort fürs Erstellen, Design im FilmOrbit-Stil, deutsche Erklärung/FAQ, Betrieb per Docker hinter Caddy mit Image aus GitHub.

**Architecture:** Zugangspasswort als neue, in sich geschlossene Go-Datei `pkg/server/access.go` (Endpunkt `/access`, signiertes Cookie, Middleware auf `/create/secret` und `/create/file`). Frontend zeigt eine eingebettete Maske `AccessGate` statt der Erstellen-Seiten. Design über ein eigenes DaisyUI-Theme `filmorbit`, das als Server-Default gesetzt wird; keine Nutzung lizenzpflichtiger Flags.

**Tech Stack:** Go 1.27 (gorilla/mux, viper/pflag), React + Vite + Tailwind 4 + DaisyUI 5, i18next, Vitest, Docker, GitHub Actions (GHCR), Caddy.

**Spec:** `docs/superpowers/specs/2026-11-13-filmorbit-yopass-design.md`

## Global Constraints

- Nur Go-Server ändern; `server/` (Rust, `:next`) bleibt unberührt.
- Keine Änderung an `license.go`/Lizenzprüfung; keine lizenzpflichtigen Flags nutzen.
- `ACCESS_PASSWORD` leer ⇒ Verhalten exakt wie Upstream (alle bestehenden Tests grün).
- Falsches Passwort ⇒ `401` **ohne** `WWW-Authenticate`-Header.
- Geschützt sind nur `POST /create/secret` und `POST /create/file`. Abruf/Löschen, `/config`, `/health`, statische Dateien bleiben frei.
- Cookie `yopass_access`: HttpOnly, `SameSite=Lax`, Pfad `/`, Gültigkeit 30 Tage, `Secure` bei HTTPS (direktes TLS, `X-Forwarded-Proto: https` von Trusted Proxy oder `--public-url` mit `https://`).
- Rate-Limit: 10 Fehlversuche pro Client-IP in 10 Minuten ⇒ `429`.
- Farben: Primär `#49ADC3` (Hover `#317382`), Akzent `#b03350`, Lila `#28183b`, Text `#1C2426`/`#050D0F`, Hintergrund `#F8F8F8`, Karten `#FFFFFF`, Rahmen `#E2E3E3`.
- Schriften: Staatliches (Überschriften), DM Sans (Text), selbst gehostet über `@fontsource` (kein Google Fonts).
- App-Name „FilmOrbit Safe“, Domain `safe.filmorbit.de`, Sprache fest Deutsch, nur helles Theme.
- Datei-Limit 1 MB, in FAQ und am Upload-Feld genannt.
- Footer: „basiert auf Yopass (Open Source)“ mit Link auf `https://github.com/jhaals/yopass`.
- `ACCESS_PASSWORD` nie im Repo; nur `.env` auf dem Server.
- Upstream-Lizenzdatei `LICENSE` bleibt erhalten.
- Commits: Conventional Commits, Feature-Branch, nie direkt auf `main`.

## Review Focus

1. **Alle Kunden kommen über Caddy** ⇒ ohne korrekte `--trusted-proxies` hätten alle dieselbe IP und sperren sich gegenseitig. Erwartung: Rate-Limit nutzt `getRealClientIP`; Test in Task 1 mit zwei verschiedenen `X-Forwarded-For`-IPs hinter Trusted Proxy.
2. **Hinter Caddy sieht Go nur HTTP** ⇒ Cookie muss trotzdem `Secure` sein und funktionieren. Test in Task 1 (`X-Forwarded-Proto: https` von Trusted Proxy ⇒ `Secure`).
3. **Passwort mit Leerzeichen aus E-Mail kopiert** ⇒ wird akzeptiert. Entscheidung: Eingabe wird serverseitig per `strings.TrimSpace` bereinigt. Test in Task 1.
4. **Passwort auf dem Server geändert** ⇒ alte Cookies ungültig, Maske erscheint wieder statt Fehlermeldung. Tests in Task 1 (Cookie mit altem Passwort ⇒ 401) und Task 2 (401 beim Erstellen ⇒ Maske).
5. **Empfänger öffnet Link ohne Cookie** ⇒ Geheimnis lässt sich abrufen. Test in Task 1 (`GET /secret/{id}` ohne Cookie ⇒ nicht 401).

---

### Task 0: Fork & Repo-Setup (nur nach ausdrücklicher Zustimmung von Niklas)

- [ ] **Step 1:** Fork auf GitHub anlegen: `gh repo fork jhaals/yopass --fork-name yopass-filmorbit --clone=false` (Account `Mineorey`, außer Niklas nennt eine Organisation).
- [ ] **Step 2:** Lokale Remotes: `git remote rename origin upstream && git remote add origin https://github.com/<account>/yopass-filmorbit.git`.
- [ ] **Step 3:** Branch `docs/filmorbit-design` pushen; Arbeit danach auf `feat/filmorbit-safe` (von `docs/filmorbit-design` abgezweigt).

Expected: `git remote -v` zeigt `origin` (Fork) und `upstream` (jhaals).

---

### Task 1: Zugangspasswort im Server

**Files:**
- Create: `pkg/server/access.go`, `pkg/server/access_test.go`
- Modify: `pkg/server/server.go` (Struct-Feld + Routen ~Zeile 120 und 180), `pkg/server/config.go` (Config-Key), `cmd/yopass-server/flags.go` (Flag + Section), `cmd/yopass-server/main.go:117ff` (Feld setzen)

**Interfaces:**
- Produces:
  - `Server.AccessPassword string`
  - `func (y *Server) accessEnabled() bool`
  - `func (y *Server) requireAccess(next http.Handler) http.Handler`
  - `func (y *Server) accessLoginHandler(w http.ResponseWriter, r *http.Request)` – `POST /access`, Body `{"password": string}`; `204` + Cookie / `401 {"message":"invalid access password"}` / `429`
  - `func (y *Server) accessStatusHandler(w http.ResponseWriter, r *http.Request)` – `GET /access` ⇒ `{"granted": bool}`
  - `/config` ⇒ `ACCESS_PASSWORD_REQUIRED: bool`
  - Geschützte Route antwortet ohne Cookie mit `401 {"message":"access password required"}`

Cookie-Format (vom Test nicht determiniert, daher hier festgelegt):

```
signingKey = HMAC-SHA256(key = "filmorbit-access-v1", msg = AccessPassword)
value      = "<expiryUnix>.<hex(HMAC-SHA256(signingKey, "<expiryUnix>"))>"
gültig     ⇔ Signatur stimmt (hmac.Equal) && expiryUnix > now
```

Passwortvergleich: `subtle.ConstantTimeCompare` auf SHA-256 beider Werte (gleiche Länge). Rate-Limiter: `map[ip][]time.Time` mit `sync.Mutex`, nur Fehlversuche zählen, Einträge älter als 10 min verwerfen.

- [ ] **Step 1: Failing tests in `access_test.go`** (Server-Konstruktion wie in `require_auth_test.go`, `testDB`):
  - `TestAccessDisabledLeavesCreateOpen` – `AccessPassword:""`, `POST /create/secret` ⇒ `200`.
  - `TestAccessRequiredBlocksCreateSecret` – ohne Cookie ⇒ `401`, Body-Message `access password required`.
  - `TestAccessRequiredBlocksCreateFile` – `POST /create/file` ohne Cookie ⇒ `401`.
  - `TestAccessLoginWrongPassword` – ⇒ `401`, `rec.Header().Get("WWW-Authenticate") == ""`, kein `Set-Cookie`.
  - `TestAccessLoginTrimsWhitespace` – Passwort `"kunde2026"`, Eingabe `"  kunde2026\n"` ⇒ `204`.
  - `TestAccessLoginSetsCookie` – ⇒ `204`; Cookie `yopass_access` mit `HttpOnly`, `SameSite=Lax`, `Path=/`, `MaxAge == 30*24*3600`; anschließend `POST /create/secret` mit Cookie ⇒ `200`.
  - `TestAccessCookieSecureBehindTrustedProxy` – `TrustedProxies` enthält `RemoteAddr`, Header `X-Forwarded-Proto: https` ⇒ Cookie `Secure == true`; ohne Header und ohne TLS/`PublicURL` ⇒ `false`.
  - `TestAccessCookieInvalidAfterPasswordChange` – Cookie von Server mit Passwort A an Server mit Passwort B ⇒ `401`.
  - `TestAccessCookieExpired` – Cookie mit `expiryUnix` in der Vergangenheit (korrekt signiert) ⇒ `401`.
  - `TestAccessRateLimitPerClientIP` – 10× falsch von IP 203.0.113.1 (via `X-Forwarded-For` hinter Trusted Proxy) ⇒ 11. Versuch `429`, auch mit richtigem Passwort; gleichzeitig IP 203.0.113.2 mit richtigem Passwort ⇒ `204`.
  - `TestAccessGetSecretStaysOpen` – `GET /secret/{id}` ohne Cookie ⇒ Status `!= 401`.
  - `TestAccessStatusEndpoint` – `GET /access` ohne Cookie ⇒ `{"granted":false}`, mit gültigem ⇒ `true`.
  - `TestConfigReportsAccessRequired` – `/config` enthält `ACCESS_PASSWORD_REQUIRED` = `true` bzw. `false`.

- [ ] **Step 2:** `go test ./pkg/server -run 'TestAccess|TestConfigReportsAccess' -v` ⇒ FAIL (undefined).
- [ ] **Step 3:** `access.go` implementieren; in `server.go` `/create/secret` und `/create/file` als `y.requireAccess(y.maybeRequireAuth(...))` registrieren (nur wenn `accessEnabled()`), `/access` GET/POST nur wenn `accessEnabled()`; `config.go` Key setzen. Flag `--access-password` (Env `ACCESS_PASSWORD` über das bestehende viper-AutomaticEnv), in `flags.go` einer passenden Section zuordnen; `main.go` setzt `AccessPassword: viper.GetString("access-password")`.
- [ ] **Step 4:** `go test ./... ` ⇒ PASS (inkl. aller Upstream-Tests).
- [ ] **Step 5:** `go vet ./...` sauber; Commit `feat: add shared access password for secret creation`.

---

### Task 2: Passwort-Maske im Frontend

**Files:**
- Create: `website/src/features/AccessGate.tsx`, `website/src/features/AccessGate.test.tsx`, `website/src/shared/hooks/useAccess.ts`
- Modify: `website/src/shared/lib/api.ts`, `website/src/app/App.tsx`, `website/src/shared/context/configContext.ts` (Typ), Erstell-Fehlerbehandlung in `website/src/shared/hooks/useSecretForm.ts` und `website/src/features/StreamingUpload.tsx`, Locales (alle Dateien, siehe Task 4 zur Key-Regel)

**Interfaces:**
- Consumes: `POST /access`, `GET /access`, `/config.ACCESS_PASSWORD_REQUIRED`, 401-Message `access password required` (Task 1)
- Produces:
  - `api.ts`: `getAccessStatus(): Promise<boolean>`, `submitAccessPassword(password: string): Promise<'ok' | 'invalid' | 'rate_limited'>`
  - `useAccess(): { required: boolean; granted: boolean; loading: boolean; grant(): void; revoke(): void }` (React-Context, Provider in `App.tsx` oder `main.tsx`)
  - `<AccessGate />` – rendert Maske, ruft bei Erfolg `grant()`
  - i18n-Keys `access.title`, `access.description`, `access.passwordLabel`, `access.submit`, `access.invalid`, `access.rateLimited`

Texte (de):
- `access.title`: „Zugang für Kundinnen und Kunden“
- `access.description`: „Diese Seite ist für Kundinnen und Kunden von FilmOrbit. Das Zugangspasswort bekommst du von uns.“
- `access.passwordLabel`: „Zugangspasswort“ · `access.submit`: „Weiter“
- `access.invalid`: „Das Passwort stimmt nicht. Bitte versuch es noch einmal.“
- `access.rateLimited`: „Zu viele Versuche. Bitte warte ein paar Minuten.“

- [ ] **Step 1: Failing tests `AccessGate.test.tsx`** (Vitest + Testing Library, `fetch` gemockt wie in bestehenden Tests):
  - zeigt Passwortfeld (Label „Zugangspasswort“, `type="password"`) und Button „Weiter“.
  - Enter im Feld sendet `POST /access` mit `{"password": "<eingabe>"}`.
  - Antwort 401 ⇒ Text aus `access.invalid` sichtbar, Feld bleibt.
  - Antwort 429 ⇒ Text aus `access.rateLimited`.
  - Antwort 204 ⇒ `grant` aufgerufen.
  - In `App.test.tsx`: `ACCESS_PASSWORD_REQUIRED: true` + `granted:false` ⇒ auf `/` erscheint Maske, auf `/#/s/<id>/<key>` nicht.
- [ ] **Step 2:** `yarn test:unit` ⇒ FAIL.
- [ ] **Step 3:** Implementieren. In `App.tsx` analog zu `needsLogin`: `needsAccess = required && !loading && !granted`, gilt für die Erstell-Routen (Text, Upload). Bekommt ein Erstell-Request `401` mit Message `access password required`, wird `revoke()` aufgerufen ⇒ Maske erscheint.
- [ ] **Step 4:** `yarn test:unit` und `yarn lint` ⇒ PASS.
- [ ] **Step 5:** Commit `feat: add embedded access password gate`.

---

### Task 3: FilmOrbit-Design

**Files:**
- Modify: `website/src/shared/styles/index.css`, `website/package.json` (+ `@fontsource/staatliches`, `@fontsource/dm-sans`), `pkg/server/config.go:12-13` (`DefaultThemeLight = "filmorbit"`, `DefaultThemeDark = "filmorbit"`), `pkg/server/server_test.go:2093,2182` (Erwartung auf `filmorbit`), `website/public/theme-init.js` (beide Defaults `filmorbit`), `website/index.html` (Titel „FilmOrbit Safe – Zugangsdaten sicher übermitteln“), `website/src/shared/components/Navbar.tsx` (FilmOrbit-Logo, Link auf `https://filmorbit.de`), Footer-Komponente (in `App.tsx` bzw. dort, wo Impressum/Datenschutz gerendert werden)
- Create: `website/public/filmorbit-logo.png` (aus `https://neu.filmorbit.de/uploads/ky5E3x4J6PPd-9dxCvAUt-logo-filmorbit-alt1.png`), Favicon/`apple-touch-icon.png` aus dem Logo-Signet ersetzen

**Interfaces:**
- Produces: DaisyUI-Theme `filmorbit` (via `@plugin "daisyui/theme" { name: "filmorbit"; default: true; color-scheme: light; … }`), CSS-Variablen `--font-display` (Staatliches), Body-Font DM Sans.

Theme-Werte: `--color-primary #49ADC3`, `--color-primary-content #050D0F`, `--color-secondary #b03350`, `--color-accent #28183b`, `--color-neutral #1C2426`, `--color-base-100 #FFFFFF`, `--color-base-200 #F8F8F8`, `--color-base-300 #E2E3E3`, `--color-base-content #1C2426`. Seitenhintergrund `base-200`, Karten `base-100`. `h1,h2,h3` in Staatliches, Großbuchstaben, `letter-spacing: 0`. Radius/Schatten: Builder gleicht mit neu.filmorbit.de ab.

- [ ] **Step 1:** Server-Tests auf `filmorbit` anpassen ⇒ `go test ./pkg/server -run Theme -v` FAIL; Konstanten ändern ⇒ PASS.
- [ ] **Step 2:** Theme, Schriften, Logo, Favicon, Titel, Footer-Hinweis umsetzen; Vorkommen von „Yopass“ im sichtbaren UI (Navbar, Titel, Footer) entfernen, außer dem Lizenz-Hinweis.
- [ ] **Step 3:** `yarn build` und `yarn test:unit` ⇒ PASS (Navbar-Snapshot/Tests ggf. anpassen).
- [ ] **Step 4:** Lokal starten (Docker Compose aus Task 5 oder `go run ./cmd/yopass-server` + `yarn dev`) und im Browser gegen neu.filmorbit.de vergleichen: Screenshot von Startseite, Maske, Upload und Anzeige-Seite an Niklas.
- [ ] **Step 5:** Commit `feat: apply FilmOrbit design`.

---

### Task 4: Deutsche Erklärung und FAQ

**Files:**
- Modify: `website/src/shared/lib/i18n.ts` (Sprache fest `de`: `lng: 'de'`, `fallbackLng: 'de'`, LanguageDetector entfernen), `website/src/shared/components/FeaturesSection.tsx` (wird „So funktioniert's“ + FAQ), alle Dateien in `website/src/shared/locales/`
- Test: `website/src/shared/components/FeaturesSection.test.tsx` (neu)

**Key-Regel:** `scripts/check-locales.mjs` verlangt in allen Locales dieselben Keys wie `en.json`. Neue Keys: deutscher Text in `de.json`, englische Übersetzung in `en.json`, in allen übrigen Locales der englische Text.

Inhalt (de, finale Formulierung darf der Builder glätten, Aussagen bleiben):
- Überschrift: „Zugangsdaten sicher an FilmOrbit schicken“
- Schritte: (1) „Zugangsdaten eintragen – sie werden direkt in deinem Browser verschlüsselt.“ (2) „Link an FilmOrbit schicken – der Schlüssel steckt nur im Link, nicht auf unserem Server.“ (3) „Nach dem ersten Öffnen wird das Geheimnis gelöscht, spätestens nach Ablauf der gewählten Zeit.“
- FAQ: „Kann FilmOrbit oder der Server meine Daten lesen?“ (nein, nur verschlüsselt gespeichert; lesen kann nur, wer den vollständigen Link hat) · „Was passiert nach Ablauf?“ (automatisch gelöscht) · „Was, wenn der Link verloren geht?“ (einfach neu erstellen; alter Link verfällt) · „Kann ich auch Dateien schicken?“ (ja, bis 1 MB, z. B. Schlüsseldateien oder Zertifikate; gedacht ist das Tool vor allem für Text)
- In `de.json` alle sichtbaren „Yopass“-Nennungen durch „FilmOrbit Safe“ bzw. neutrale Formulierungen ersetzen.

- [ ] **Step 1: Failing test** – `FeaturesSection` rendert die 3 Schritte und 4 FAQ-Fragen; Antwort zu Dateien enthält „1 MB“.
- [ ] **Step 2:** `yarn test:unit` ⇒ FAIL; implementieren; ⇒ PASS.
- [ ] **Step 3:** `yarn lint` (inkl. Locale-Check) ⇒ PASS. Prüfen, dass der Upload-Bereich das Limit anzeigt (`upload.maxFileSize`, existiert bereits in `StreamingUpload.tsx:280`).
- [ ] **Step 4:** Commit `feat: add German explanation and FAQ`.

---

### Task 5: Betrieb – Docker, Caddy, GitHub

**Files:**
- Create: `deploy/filmorbit/docker-compose.yml`, `deploy/filmorbit/.env.example`, `deploy/filmorbit/Caddyfile.snippet`, `deploy/filmorbit/README.md` (deutsch: Installation, Update, Passwort ändern, Upstream-Merge), `.github/workflows/filmorbit-image.yml`
- Modify/Delete: Upstream-Workflows `docker.yaml`, `release.yml`, `deploy-cloudflare-share.yml`, `notify-microsite.yml` entfernen (Fork soll nichts von Upstream veröffentlichen); `test.yml`, `codeql-analysis.yml`, `yamllint.yml` behalten; `.gitignore` um `deploy/filmorbit/.env`.

Vorgaben:
- Compose: Dienste `yopass` (Image `ghcr.io/<account>/yopass-filmorbit:latest`, alternativ `build: ../..`) und `memcached`, eigenes Netz, kein Port 80/443; `yopass` nur `127.0.0.1:1337:1337` **oder** im Docker-Netz von Caddy – Builder prüft auf dem Server, wie Caddy läuft, und wählt eine Variante; README beschreibt die gewählte.
- Env: `MEMCACHED=memcached:11211`, `ACCESS_PASSWORD`, `PUBLIC_URL=https://safe.filmorbit.de`, `TRUSTED_PROXIES`, `NO_LANGUAGE_SWITCHER=true`, `NO_THEME_SWITCHER=true`, `FORCE_ONETIME_SECRETS=true`, `MAX_FILE_SIZE=1MB`, `IMPRINT_URL=https://filmorbit.de/impressum`, `PRIVACY_NOTICE_URL=https://filmorbit.de/datenschutz` (URLs vor Abschluss auf der Website prüfen).
- Caddy: `safe.filmorbit.de { reverse_proxy <ziel>:1337 }`.
- Workflow: bei Push auf `main` und manuell; `docker/build-push-action` mit vorhandenem `Dockerfile`, Tags `latest` und `sha-<short>`, Push nach GHCR mit `GITHUB_TOKEN` (`packages: write`).

- [ ] **Step 1:** Lokal `docker compose -f deploy/filmorbit/docker-compose.yml up --build` (mit lokaler `.env`).
- [ ] **Step 2: Smoke-Test** gegen `http://localhost:1337`: `curl -i -X POST localhost:1337/create/secret -d '{...}'` ⇒ `401` ohne `WWW-Authenticate`; `curl -i -X POST localhost:1337/access -d '{"password":"<.env-Wert>"}'` ⇒ `204` + Cookie; mit Cookie erstellen ⇒ `200`; Link ohne Cookie abrufen ⇒ Geheimnis kommt. Im Browser: Maske → Geheimnis erstellen → Link in privatem Fenster öffnen.
- [ ] **Step 3:** `yamllint` auf neue Workflow-/Compose-Dateien ⇒ PASS.
- [ ] **Step 4:** Commit `chore: add FilmOrbit deployment and image workflow`.
- [ ] **Step 5 (mit Niklas, nicht automatisch):** PR `feat/filmorbit-safe` → `main` im Fork; nach Merge Image in GHCR prüfen; auf dem Server DNS `safe.filmorbit.de`, `.env`, Caddy-Block, `docker compose pull && up -d`; Endabnahme im Browser.
