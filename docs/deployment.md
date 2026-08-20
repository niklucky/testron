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
