# FilmOrbit Safe – Betrieb

FilmOrbit Safe (`https://safe.filmorbit.de`) ist unsere angepasste Version von
[Yopass](https://github.com/jhaals/yopass). Kunden schicken uns darüber Passwörter
und Zugangsdaten verschlüsselt. Ein Geheimnis wird im Browser verschlüsselt, der
Link funktioniert nur einmal und das Geheimnis wird nach dem ersten Öffnen gelöscht.
Zum **Erstellen** eines Geheimnisses braucht man ein gemeinsames Zugangspasswort;
zum **Öffnen** eines Links nicht.

Auf dem Server laufen zwei Container in einem eigenen Docker-Netz:

- `yopass` – die App (Image `ghcr.io/mineorey/yopass-filmorbit:latest`)
- `memcached` – Zwischenspeicher für die verschlüsselten Geheimnisse (nur im Arbeitsspeicher)

HTTPS übernimmt das vorhandene **Caddy**. Dieser Stack belegt die Ports 80/443 nicht
und stört Instatic, n8n und DocuSeal nicht.

## Dateien in diesem Ordner

| Datei | Zweck |
| --- | --- |
| `docker-compose.yml` | Die beiden Container (Standard: Variante A) |
| `docker-compose.caddy-network.yml` | Zusatz für Variante B (Caddy in Docker) |
| `.env.example` | Vorlage für die Konfiguration; wird zu `.env` kopiert |
| `Caddyfile.snippet` | Block für die Caddyfile |

Die `.env` enthält das Zugangspasswort. Sie liegt nur auf dem Server und wird nie
ins Git-Repository eingecheckt (sie steht in `.gitignore`).

## Schritt 0: Welche Variante gilt auf unserem Server?

Auf dem Server (per SSH) prüfen, wie Caddy läuft:

```sh
systemctl status caddy        # "active (running)"  -> Caddy läuft direkt auf dem Server
docker ps | grep -i caddy     # Zeile mit caddy-Image -> Caddy läuft in Docker
```

- **Variante A – Caddy direkt auf dem Server** (`systemctl` zeigt "active (running)",
  `docker ps` zeigt keinen Caddy-Container): Yopass ist nur unter `127.0.0.1:1337` auf
  dem Server erreichbar, Caddy leitet dorthin weiter. Das ist der Standard.
- **Variante B – Caddy läuft in Docker** (`docker ps` zeigt einen Caddy-Container):
  Yopass tritt dem Docker-Netz von Caddy bei, es wird kein Port veröffentlicht.

## Erstinstallation

### 1. DNS

Beim Domain-Anbieter einen **A-Record** anlegen:
`safe.filmorbit.de` → IP-Adresse des Servers (bei IPv6 zusätzlich ein AAAA-Record).
Erst wenn der Name auflöst, kann Caddy das HTTPS-Zertifikat holen
(Prüfen: `ping safe.filmorbit.de` zeigt die Server-IP).

### 2. Dateien auf den Server holen

Entweder das Repository klonen:

```sh
git clone https://github.com/Mineorey/yopass-filmorbit.git
cd yopass-filmorbit/deploy/filmorbit
```

oder nur den Ordner `deploy/filmorbit` auf den Server kopieren (z. B. nach
`/opt/filmorbit-safe`) und dorthin wechseln. Alle folgenden Befehle laufen in diesem Ordner.

### 3. Konfiguration (`.env`)

```sh
cp .env.example .env
nano .env
```

- `ACCESS_PASSWORD=` – das Zugangspasswort für Kunden eintragen. Lang und zufällig,
  am besten nur Buchstaben, Ziffern und Bindestriche (kein `$`, keine Anführungszeichen,
  keine Leerzeichen). Ohne Passwort startet der Container absichtlich nicht.
- Alles andere ist schon richtig gesetzt (`PUBLIC_URL`, Einmal-Links, 1 MB Dateigröße,
  Impressum und Datenschutz von filmorbit.de).
- `TRUSTED_PROXIES` – **muss** zur Variante passen, sonst teilen sich alle Kunden ein
  gemeinsames Anfrage-Limit und sperren sich gegenseitig aus:
  - Variante A: `TRUSTED_PROXIES=127.0.0.1` (Standard, nichts ändern)
  - Variante B: das Subnetz des Caddy-Netzes, siehe unten

Nur für **Variante B** zusätzlich:

```sh
# Name des Netzes, in dem Caddy hängt:
docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' <caddy-container>
# Subnetz dieses Netzes:
docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' <netzname>
```

In `.env` eintragen, z. B.:

```sh
CADDY_NETWORK=caddy
TRUSTED_PROXIES=172.18.0.0/16
```

### 4. Starten

Variante A:

```sh
docker compose pull
docker compose up -d
```

Variante B (immer beide Dateien angeben):

```sh
docker compose -f docker-compose.yml -f docker-compose.caddy-network.yml pull
docker compose -f docker-compose.yml -f docker-compose.caddy-network.yml up -d
```

Tipp für Variante B: einmal `echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.caddy-network.yml' >> .env`
ausführen – danach reicht überall das kurze `docker compose …` wie bei Variante A.

Prüfen: `docker compose ps` zeigt beide Container als "running" bzw. "healthy".
Bei Variante A zusätzlich: `curl -I http://127.0.0.1:1337` liefert `HTTP/1.1 200 OK`.

Falls `pull` mit "denied" oder "unauthorized" abbricht, siehe „Image ist privat“ unten.

### 5. Caddy

Den passenden Block aus `Caddyfile.snippet` in die bestehende Caddyfile einfügen:

```caddyfile
# Variante A
safe.filmorbit.de {
	reverse_proxy 127.0.0.1:1337
}

# Variante B
safe.filmorbit.de {
	reverse_proxy yopass:1337
}
```

Danach Caddy neu laden:

- Variante A: `sudo systemctl reload caddy` (oder `caddy reload --config /etc/caddy/Caddyfile`)
- Variante B: `docker exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile`
  (oder `docker restart <caddy-container>`)

### 6. Abnahme

`https://safe.filmorbit.de` öffnen → Passwort-Maske → Zugangspasswort eingeben →
Geheimnis erstellen → Link in einem privaten Fenster öffnen → Geheimnis erscheint;
beim zweiten Öffnen ist es weg.

## Updates einspielen

Jeder Push auf den Branch `master` im GitHub-Repository baut automatisch ein neues
Image (GitHub Actions, Workflow „FilmOrbit Safe image“, Ergebnis unter
*Packages* im Repository). Danach auf dem Server im Ordner `deploy/filmorbit`:

```sh
docker compose pull
docker compose up -d
```

Offene Geheimnisse liegen nur im Arbeitsspeicher von memcached und gehen verloren,
wenn memcached neu startet. Ein reines App-Update startet nur den `yopass`-Container
neu; Links bleiben dann gültig.

## Zugangspasswort ändern

1. `.env` öffnen und `ACCESS_PASSWORD=` ändern.
2. `docker compose up -d` ausführen (der Container startet mit dem neuen Passwort neu).
3. Alle Kunden müssen das neue Passwort beim nächsten Erstellen eingeben; das alte gilt
   sofort nicht mehr. Bereits verschickte Links funktionieren weiter.

## Image ist privat (GHCR)

Neue Pakete in der GitHub Container Registry sind oft zunächst **privat**. Dann
schlägt `docker compose pull` auf dem Server fehl. Zwei Möglichkeiten:

- **Paket öffentlich machen** (einfachste Lösung; das Image enthält keine Geheimnisse –
  das Passwort steht nur in der `.env` auf dem Server): GitHub → Profil → *Packages* →
  `yopass-filmorbit` → *Package settings* → *Change visibility* → *Public*.
- **Privat lassen:** auf GitHub ein Personal Access Token (classic) mit nur dem Recht
  `read:packages` anlegen und auf dem Server einmalig anmelden:

  ```sh
  docker login ghcr.io -u Mineorey
  # Bei "Password" das Token einfügen (nicht das GitHub-Passwort)
  ```

## Updates von Yopass (Upstream) übernehmen

Auf dem eigenen Rechner im geklonten Repository:

```sh
git remote add upstream https://github.com/jhaals/yopass.git   # nur beim ersten Mal
git checkout master
git fetch upstream
git merge upstream/master
# Konflikte ggf. lösen, lokal testen
git push origin master
```

Der Push baut automatisch das neue Image; danach auf dem Server wie unter
„Updates einspielen“ `docker compose pull && docker compose up -d`.

Hinweis: Die Upstream-Workflows, die offizielle Yopass-Images oder Releases
veröffentlichen, sind in diesem Fork entfernt. Gebaut wird nur
`.github/workflows/filmorbit-image.yml` (bei Push auf `master` oder manuell über
*Actions → FilmOrbit Safe image → Run workflow*).

## Nützliche Befehle

```sh
docker compose ps              # Läuft alles?
docker compose logs -f yopass  # Protokoll der App ansehen (Strg+C beendet)
docker compose restart yopass  # App neu starten
docker compose down            # Stack stoppen (offene Geheimnisse gehen verloren)
```
