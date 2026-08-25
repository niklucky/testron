# VPS deployment

The production workflow builds the server image, pushes an immutable commit tag
to GitHub Container Registry, and deploys `compose.yml` over SSH. The stack binds
Testron to `127.0.0.1:4400`; nginx should proxy the public HTTPS host to that
address. PostgreSQL is reachable only inside the Compose network.

## VPS preparation

Install Docker Engine with the Compose plugin, create the `github` user, add it
to the Docker group, and create its SSH key. Prepare the deployment and database
directories before the first deployment:

```sh
sudo install -d -o github -g github /opt/testron
sudo install -d /data/testron/db
```

The deployment directory defaults to `/opt/testron`. PostgreSQL data is stored
on the host at `/data/testron/db`.

Configure nginx with an HTTPS virtual host whose upstream is:

```nginx
location / {
    proxy_pass http://127.0.0.1:4400;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## GitHub production environment

Create an environment named `production`. Add these encrypted secrets:

- `SSH_PRIVATE_KEY`: private key for the VPS `github` user.
- `VPS_KNOWN_HOSTS`: pinned SSH host-key line for the VPS. Generate it from a
  trusted machine with `ssh-keyscan -H your-host` and verify its fingerprint.
- `POSTGRES_PASSWORD`: strong URL-safe password, such as a long hex value.
- `TESTRON_AUTH_ENCRYPTION_KEYS`: versioned 32-byte key used for project
  secrets and derived server browser state, for example `1:<base64-key>`.
  Generate the key material with `openssl rand -base64 32`; retain old
  versions comma-separated during rotation.
- `RESEND_API_KEY`: optional Resend key with sending access. Set it to enable
  invitation email delivery.

Add these environment variables:

- `VPS_HOST`: VPS hostname or IP address.
- `VPS_PORT`: SSH port; defaults to `22` when empty.
- `VPS_USER`: SSH user; defaults to `github` when empty.
- `VPS_DEPLOY_PATH`: deployment directory; defaults to `/opt/testron` when
  empty.
- `VPS_WEB_PATH`: public site directory; defaults to `/var/www/testron.dev`
  when empty.
- `TESTRON_PUBLIC_URL`: public HTTPS server URL, for example
  `https://api.testron.example`.
- `RESEND_FROM_EMAIL`: required when `RESEND_API_KEY` is set. Use a sender on a
  domain verified in Resend, for example `Testron <invites@testron.example>`.

Optional bootstrap secrets are `TESTRON_BOOTSTRAP_EMAIL` and
`TESTRON_BOOTSTRAP_PASSWORD`. They are only needed to provision the alpha
bootstrap account; normal account registration does not require them.

Invitation records are always available in the desktop app. When both Resend
variables are configured, creating an invitation also sends an email with an
idempotency key derived from the invitation ID. A partial Resend configuration
stops server startup rather than silently disabling delivery.

The deployment logs in to GHCR with the workflow's short-lived `GITHUB_TOKEN`.
The VPS does not need a permanent registry token.

## Deployment behavior

Pull requests run formatting, lint, type checks, tests, and the desktop package
build. Pushes to `main` run the same checks, publish the server image, and then
deploy through the protected `production` environment. Configure required
reviewers on that environment if deployments should wait for approval.

The workflow writes `/opt/testron/.env` (or the configured deployment path) with
mode `0600`. Database migrations run automatically when the server container
starts. PostgreSQL data remains in `/data/testron/db` across deployments.

PostgreSQL is exposed only on VPS loopback at `127.0.0.1:4401`. To connect from
a workstation, create an SSH tunnel and connect locally on port 4401:

```sh
ssh -L 4401:127.0.0.1:4401 github@your-vps
```

## Public site (testron.dev)

`apps/web` is a static Vite build. `.github/workflows/web.yml` builds it and
ships `apps/web/dist` to the VPS over the same SSH credentials the server
deployment uses. It runs on pushes to `main` that touch `apps/web`,
`packages/ui`, the lockfile, or the workflow itself, so ordinary application
commits do not redeploy the site, and it can be run manually from the Actions
tab.

Each commit is unpacked into `releases/<sha>` and published by moving the
`current` symlink onto it, so nginx never serves a half-written directory. The
five newest releases are kept; rolling back is a symlink swap on the VPS:

```sh
ln -sfn /var/www/testron.dev/releases/<sha> /var/www/testron.dev/current.new
mv -T /var/www/testron.dev/current.new /var/www/testron.dev/current
```

Prepare the site directory once, owned by the deployment user:

```sh
sudo install -d -o github -g github /var/www/testron.dev/releases
```

The path defaults to `/var/www/testron.dev` and is overridden with the
`VPS_WEB_PATH` repository variable. Serve it from nginx as a plain static root —
no proxy, since the site has no server side:

```nginx
server {
    server_name testron.dev;
    root /var/www/testron.dev/current;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Asset file names carry a content hash; index.html must never be cached.
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }
}
```

`testron.dev` and `app.testron.dev` both resolve to the VPS; the apex serves
these files and the subdomain proxies to `127.0.0.1:4400` as above.

The site reads the newest release tag from the public GitHub API purely to
display it. Download links do not depend on that request.

## Desktop releases

`.github/workflows/release.yml` builds four distributables — macOS arm64, macOS
x64, Windows x64, Linux x64 — and publishes them to a GitHub Release when a
`v*` tag is pushed:

```sh
git tag v0.1.0
git push origin v0.1.0
```

Assets are renamed to fixed names (`Testron-macos-arm64.zip`,
`Testron-macos-x64.zip`, `Testron-windows-x64.zip`, `Testron-linux-x64.zip`) so
that `releases/latest/download/<asset>` keeps working as versions change. The
site's download buttons rely on those names; renaming an asset means editing
`apps/web/src/lib/platform.ts` in the same commit.

Builds embed `TESTRON_SERVER_URL` from the `TESTRON_PUBLIC_URL` repository
variable, falling back to `https://app.testron.dev`. A manual run of the
workflow builds all four targets and attaches them to the run without creating a
release. macOS builds require the Developer ID and notarization secrets described
in [macOS signing and notarization](macos-signing.md); the workflow refuses to
upload them unless code-signature, stapling, and Gatekeeper verification all
pass. Windows builds remain unsigned and may show a SmartScreen warning.
