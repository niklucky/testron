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
- `RESEND_API_KEY`: optional Resend key with sending access. Set it to enable
  invitation email delivery.

Add these environment variables:

- `VPS_HOST`: VPS hostname or IP address.
- `VPS_PORT`: SSH port; defaults to `22` when empty.
- `VPS_USER`: SSH user; defaults to `github` when empty.
- `VPS_DEPLOY_PATH`: deployment directory; defaults to `/opt/testron` when
  empty.
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

`apps/web` is a static Vite build published to GitHub Pages by
`.github/workflows/web.yml`. The workflow runs on pushes to `main` that touch
`apps/web`, `packages/ui`, the lockfile, or the workflow itself, so ordinary
application commits do not redeploy the site. It can also be run manually from
the Actions tab.

One-time setup in the repository settings:

- **Pages → Build and deployment → Source**: `GitHub Actions`.
- **Pages → Custom domain**: `testron.dev`, with **Enforce HTTPS** enabled. The
  domain is also committed as `apps/web/public/CNAME`, which keeps it set across
  deployments.
- DNS for the apex: four `A` records to GitHub's Pages addresses
  (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`),
  or `ALIAS`/`ANAME` to `niklucky.github.io` where the provider supports it.
  `app.testron.dev` stays a separate record pointing at the VPS.

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
release. Nothing is code-signed or notarized yet, so macOS and Windows show the
usual unidentified-developer warnings on first launch.
