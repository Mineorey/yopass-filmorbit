# FilmOrbit Yopass – Design

Stand: 2026-11-13 · Basis: Fork von `jhaals/yopass` (Commit `b92383e6`)

## Absicht und Warum

FilmOrbit (Marketingagentur, Dorsten) braucht einen seriösen Weg, über den **Kunden ihnen Zugangsdaten, API-Schlüssel und Ähnliches schicken**, ohne diese im Klartext per Mail oder Chat zu senden und ohne ein fremd wirkendes Drittanbieter-Tool. Dafür wird Yopass geforkt, im FilmOrbit-Design auf dem eigenen Server betrieben und mit einem einfachen Zugangspasswort vor fremder Nutzung geschützt.

Typischer Ablauf: Kunde öffnet die Seite → gibt das Zugangspasswort ein (das FilmOrbit ihm mitgeteilt hat) → erstellt ein Geheimnis → schickt FilmOrbit den Link. Der umgekehrte Weg (FilmOrbit → Kunde) funktioniert genauso.

## Ziele

1. **Zugangspasswort für das Erstellen** von Geheimnissen (Text und Datei). Eingabe in einem Feld **direkt auf der Seite**, kein Browser-Popup (kein HTTP Basic Auth).
2. **Öffnen eines Links bleibt frei**: Wer einen Geheimnis-Link bekommt, braucht kein Passwort.
3. **Optik wie neu.filmorbit.de**: Schriften, Farben, Logo, Rundungen/Buttons.
4. **Bessere Erklärung** auf Deutsch: was das Tool ist, wie es funktioniert, warum es sicher ist.

## Nicht-Ziele

- Keine Benutzerkonten, kein OIDC, keine Rechteverwaltung.
- Keine „Hochsicherheit“ für das Zugangspasswort: Es ist bewusst einfach und dient nur gegen Missbrauch der Serverleistung. Die eigentliche Sicherheit der Geheimnisse (Ende-zu-Ende-Verschlüsselung im Browser) bleibt unverändert.
- Keine Umgehung der Yopass-Lizenzprüfung. Lizenzpflichtige Funktionen (Secret Requests, OIDC, Audit-Log, Webhooks, Branding-Flags) bleiben aus. Design wird stattdessen direkt im Frontend-Code des Forks umgesetzt (Apache 2.0 erlaubt Änderungen).
- Kein Umbau der Verschlüsselung, Speicherung oder API-Formate.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Der Passwortschutz lässt sich umgehen, indem man die API direkt aufruft (reine Frontend-Prüfung).
- Ein Browser-Popup für Benutzername/Passwort erscheint.
- Empfänger eines Links werden nach dem Passwort gefragt.
- Die Änderungen sind so breit über den Code verstreut, dass Sicherheitsupdates von Upstream kaum noch einzuspielen sind.
- Die Seite wirkt weiterhin wie „Yopass“ statt wie ein FilmOrbit-Werkzeug.

## Rahmenbedingungen

- Upstream ist sehr aktiv (Dependency-Updates nahezu täglich). Änderungen klein, gebündelt und in eigenen Dateien halten, wo möglich.
- Stabiler Server ist der **Go-Server** (`cmd/yopass-server`, `pkg/server`). Der Rust-Server (`server/`, Image `:next`) ist Alpha und wird **nicht** angepasst; das eigene Docker-Image baut nur Go + Website.
- Frontend: React + Vite + Tailwind/DaisyUI (`website/`), deutsche Übersetzung vorhanden (`website/src/shared/locales/de.json`).
- Betrieb auf eigenem Server per Docker; Vorlage `deploy/docker-compose/with-nginx-proxy-and-letsencrypt`.

## Ansätze (Passwortschutz)

| Ansatz | Bewertung |
|---|---|
| **1. Prüfung im Go-Server + eingebettete Maske** (gewählt) | Server lehnt Erstellen ohne gültiges Zugangs-Cookie ab; Frontend zeigt eigene Maske. Nicht per API umgehbar, kein Popup, kleiner Eingriff an vorhandener Stelle (`maybeRequireAuth`). |
| 2. Nur im Frontend | Schnell, aber per direktem API-Aufruf umgehbar → verfehlt das Ziel „kein Missbrauch der Serverleistung“. Verworfen. |
| 3. Webserver (nginx/Caddy) | Kein Yopass-Code, aber ohne Popup nur umständlich (Cookie-Logik im Proxy), schlecht im Design anpassbar. Verworfen. |

Niklas hat Ansatz 1 gewählt.

## Design

### A. Zugangspasswort (Server, Go)

- Neuer Parameter `--access-password` / Env `ACCESS_PASSWORD` (leer = Funktion aus, Verhalten wie Upstream).
- Neuer Endpunkt `POST /access` mit JSON `{ "password": "…" }`:
  - Vergleich in konstanter Zeit (`crypto/subtle`).
  - Richtig → setzt Cookie `yopass_access` (HttpOnly, `Secure` bei HTTPS, `SameSite=Lax`, Pfad `/`). *Builder-Entscheidung:* HTTPS gilt als erkannt bei direktem TLS, bei `X-Forwarded-Proto: https` von einem vertrauenswürdigen Proxy (`--trusted-proxies`) oder wenn `--public-url` mit `https://` beginnt – nötig, weil der Go-Server hinter einem Proxy nur HTTP sieht, Inhalt: HMAC-signierter Ablaufzeitpunkt. Gültigkeit **30 Tage**. Antwort `204`.
  - Falsch → `401` mit JSON-Fehler, **ohne** `WWW-Authenticate`-Header (sonst Browser-Popup).
  - Einfache Bremse gegen Durchprobieren: pro Client-IP (vorhandenes `getRealClientIP`) max. ~10 Fehlversuche pro 10 Minuten, danach `429`. In-Memory reicht.
- Signaturschlüssel: aus dem Passwort abgeleitet (z. B. HMAC-SHA256 mit fester Domain-Trennung). Folge: Passwort ändern macht alle Cookies ungültig – gewollt.
- `GET /access` → `{ "granted": true|false }` für das Frontend.
- Geschützt werden genau die Erstell-Routen: `POST /create/secret`, `POST /create/file`. Umsetzung: neue Middleware `requireAccess`, eingehängt in bzw. neben `maybeRequireAuth` in `pkg/server/server.go`/`policy.go`. Ohne gültiges Cookie → `401` JSON `access password required`.
- **Nicht** geschützt: Abrufen/Löschen von Geheimnissen und Dateien, `/config`, `/health`, statische Dateien.
- `/config` liefert zusätzlich `ACCESS_PASSWORD_REQUIRED: true|false`.
- Neuer Code in eigener Datei `pkg/server/access.go` + Tests `access_test.go`.

### B. Passwort-Maske (Frontend)

- Neue Komponente `website/src/features/AccessGate.tsx`, Muster wie das vorhandene `LoginRequired`.
- In `App.tsx`: Wenn `ACCESS_PASSWORD_REQUIRED` und `GET /access` → nicht freigegeben, zeigen die Erstellen-Seiten (Text `/`, Datei `/upload`) statt ihres Inhalts die Maske. Anzeige-Routen (`/s/…`, `/f/…` usw.) bleiben unberührt.
- Maske: Überschrift, kurzer Satz („Diese Seite ist für Kundinnen und Kunden von FilmOrbit. Das Zugangspasswort bekommst du von uns.“), Passwortfeld, Button „Weiter“, Fehlermeldung unter dem Feld. Enter sendet ab.
- Erfolg → Inhalt erscheint ohne Neuladen.
- Fällt das Cookie später weg (401 beim Erstellen), erscheint die Maske wieder statt einer kryptischen Fehlermeldung.

### C. Design (FilmOrbit-Look)

Quelle: Design-Variablen von neu.filmorbit.de.

- Schriften: **Staatliches** (Überschriften), **DM Sans** (Text) – selbst gehostet im Fork (keine Google-Fonts-Abfrage, DSGVO).
- Farben: Primär Blau `#49ADC3` (Hover `#317382`), Akzent Pink `#b03350`, Lila `#28183b`, Text `#1C2426`/`#050D0F`, Hintergrund `#F8F8F8`, Karten `#FFFFFF`, Rahmen `#E2E3E3`.
- Umsetzung als eigenes DaisyUI-Theme `filmorbit` im CSS des Forks und als Standard gesetzt (nicht über die lizenzpflichtigen Theme-Flags).
- Nur helles Theme; Theme-Umschalter ausgeblendet.
- Logo: FilmOrbit-Logo (von der Website) in der Navbar statt Yopass-Logo; Favicon/Touch-Icon ersetzen. App-Name „FilmOrbit Safe“ im Tab-Titel.
- Navbar/Footer: Link zurück zu filmorbit.de, Impressum und Datenschutz (über vorhandene `--imprint-url`/`--privacy-notice-url`, die ohne Lizenz funktionieren).
- Hinweise auf „Yopass“ im UI entfernen; im Footer dezent „basiert auf Yopass (Open Source)“ als Lizenz-Hinweis.

### D. Erklärung

- Deutsch als feste Standardsprache, Sprachumschalter aus (`--no-language-switcher`).
- Bereich „So funktioniert's“ unter dem Formular, 3 Schritte:
  1. Zugangsdaten eintragen – sie werden direkt in deinem Browser verschlüsselt.
  2. Link an FilmOrbit schicken – der Schlüssel steckt nur im Link, nicht auf unserem Server.
  3. Nach dem ersten Öffnen ist das Geheimnis gelöscht (bzw. nach Ablaufzeit).
- Kurze FAQ (3–4 Fragen): Was sehen wir? Was passiert bei Ablauf? Was, wenn der Link verloren geht? Darf ich auch Dateien schicken? (Antwort: ja, bis **1 MB** – z. B. Schlüsseldateien, Zertifikate; gedacht ist das Tool vor allem für Text.)
- **Datei-Limit 1 MB** (ohne Lizenz fest im Server, siehe `pkg/server/policy.go`) wird auch direkt am Upload-Feld genannt. Entscheidung Niklas: Limit beibehalten, keine Lizenz, Upload bleibt an.
- Ersetzt bzw. erweitert die vorhandene `FeaturesSection`. Texte in `de.json` (englische Schlüssel bleiben als Fallback).

### E. Betrieb

Zielserver (Angaben Niklas): Linux-Server mit **Caddy** als vorhandenem Reverse Proxy; daneben laufen bereits Instatic CMS, n8n und DocuSeal. Das Tool läuft als **eigene, getrennte Instanz** daneben.

- **Domain:** `safe.filmorbit.de` (Entscheidung Niklas). App-Name passend: „FilmOrbit Safe“.
- **Container:** eigenes `docker-compose.yml` im Fork (z. B. `deploy/filmorbit/`) mit `yopass` + `memcached` in einem eigenen Docker-Netz. Keine Ports 80/443 belegen; Yopass ist nur für Caddy erreichbar (entweder `127.0.0.1:<port>` auf dem Host oder über das Docker-Netz von Caddy – je nachdem, wie Caddy dort läuft; *Builder prüft das auf dem Server*). Die nginx/Let's-Encrypt-Vorlage aus Upstream wird **nicht** verwendet.
- **Caddy:** ein Site-Block `safe.filmorbit.de { reverse_proxy … }`; Caddy kümmert sich um HTTPS. `TRUSTED_PROXIES` auf die Adresse von Caddy setzen (z. B. `127.0.0.1` bzw. das Docker-Subnetz), `PUBLIC_URL=https://safe.filmorbit.de`.
- **Build & Auslieferung:**
  1. Lokal: Image mit dem vorhandenen `Dockerfile` bauen und per Docker Compose testen.
  2. GitHub: Workflow im Fork baut bei Push auf `main` das Image und veröffentlicht es in der GitHub Container Registry (`ghcr.io/<account>/yopass-filmorbit`). Die Upstream-Workflows unter `.github/workflows`, die Upstream-Images veröffentlichen, werden im Fork deaktiviert bzw. entfernt.
  3. Server: `docker compose pull && docker compose up -d` (manuell; Automatisierung per Deploy-Workflow ist später möglich, aber nicht Teil dieses Umfangs).
- **Geheimnisse der Konfiguration** (`ACCESS_PASSWORD`) stehen nur in einer `.env` auf dem Server, nie im Repo.
- Relevante Einstellungen: `ACCESS_PASSWORD`, `NO_LANGUAGE_SWITCHER=true`, `NO_THEME_SWITCHER=true`, `IMPRINT_URL`, `PRIVACY_NOTICE_URL`, `TRUSTED_PROXIES`, `PUBLIC_URL`, `FORCE_ONETIME_SECRETS=true` (Empfehlung), `MAX_FILE_SIZE=1MB`.
- Upstream-Updates: Remote `upstream` auf `jhaals/yopass`, regelmäßig mergen.

## Vom Builder zu entscheiden

- Genaue Komponenten-/Dateistruktur im Frontend, solange die FilmOrbit-Änderungen gebündelt bleiben.
- Konkrete Rate-Limit-Werte, Cookie-Name, Fehlertexte.
- Feinschliff der DaisyUI-Theme-Werte (Radius, Schatten) anhand der Website.
- Ob Playwright-/Vitest-Tests angepasst oder ergänzt werden müssen (bestehende Tests müssen grün bleiben).
