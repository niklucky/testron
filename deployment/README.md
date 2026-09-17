# Server provisioning

Run `provision-app.sh` from your workstation to prepare **Debian 13 with
systemd** over SSH. The default target is the `testron` alias in `~/.ssh/config`.
The login must be root or have passwordless sudo. No application is deployed
by this script; GitHub Actions continues to handle that.

## First run

1. Point `app.testron.dev` and `testron.dev` DNS at the new server. Any AAAA
   records must also point at it. Allow inbound TCP 80, 443, and your SSH port
   in the provider firewall. HTTP port 80 must remain reachable for renewal.
2. Create `deployment/.env.production` from `.env.example` if it does not
   already exist. Set `CERT_EMAIL` and optionally `SLANG_API_KEY`. Values are
   literal `KEY=value`, with optional surrounding quotes; no shell expansion
   or inline comments. Environment variables override file values.
3. Generate your deployment key and supply the developer's public key:

   ```sh
   ssh-keygen -t ed25519 -f deployment/github_id_rsa -C github@testron -N ''
   cp ~/.ssh/id_ed25519.pub deployment/developer_keys.pub
   # Add other developer public keys, one per line, if needed.
   ./deployment/provision-app.sh
   ```

Only `github_id_rsa.pub` and `developer_keys.pub` are uploaded. The private
`github_id_rsa` stays local: put its contents in the GitHub production
environment's `SSH_PRIVATE_KEY` secret. Existing authorized keys are preserved;
reruns do not duplicate keys. To revoke a key, remove it from the server's
`authorized_keys` explicitly. Keys and `.env.production` are gitignored.

Provisioning honors the alias's identity and port. The developer login check
uses the same alias with `-l developer`, so its key must be available through
your agent, SSH config, or `SSH_IDENTITY_FILE`. Verify the new host's SSH
fingerprint through the provider console and connect interactively once before
running the noninteractive script.

## What gets prepared

- nginx, Certbot with its renewal timer, and Docker Engine/Compose from Docker's
  signed apt repository. Installed packages are not upgraded on each rerun.
- `github` in the Docker group, with the supplied deployment public key.
- `developer` (configurable) with the supplied public keys and passwordless sudo.
- `/opt/testron` and `/var/www/testron.dev/releases`, owned by `github`.
- `/data/testron/db` and `/data/testron/artifacts`. The artifacts directory is
  owned by UID/GID 1000, matching the server image. Existing contents are not
  recursively chowned; PostgreSQL initializes and owns its directory itself.
- nginx for `app.testron.dev` (proxy to `127.0.0.1:4400`) and `testron.dev`
  (static website at `/var/www/testron.dev/current`). `INCLUDE_WWW=1` adds
  `www.testron.dev` to the website and certificate.
- Let's Encrypt webroot certificates. Existing certificates are reused until
  renewal is due; the renewal hook validates and reloads nginx.
- SSH public-key authentication, no passwords or keyboard-interactive login.
  Root remains accessible by key unless `PERMIT_ROOT_LOGIN=no` is set.

The Docker group grants administrative access to the server. The production
Compose file keeps ports 4400 and 4401 on loopback; PostgreSQL is available
through an SSH tunnel. The script does not change host/provider firewall rules.

## Repeat runs

```sh
./deployment/provision-app.sh                         # full preparation
./deployment/provision-app.sh --nginx-only            # routing/template edits
./deployment/provision-app.sh --certs-only            # nginx + certificates
./deployment/provision-app.sh --skip-certs            # prepare before DNS moves
./deployment/provision-app.sh --skip-hardening        # leave SSH unchanged
./deployment/provision-app.sh --host=developer@testron # after disabling root
```

`--env=staging` selects `deployment/.env.staging`. `SSH_PORT` and
`SSH_IDENTITY_FILE` are optional overrides; leaving them empty preserves SSH
config behavior. Relative public-key paths are resolved from `deployment/`.

`--nginx-only` changes no packages, accounts, SSH settings, or certificates.
It requires both certificates to exist; adding `www` also requires issuing
the expanded certificate with `--certs-only` first. Use the same settings
file on every run: an empty Slang key deliberately disables the relay.

`--skip-certs` preserves existing HTTPS sites. Sites without certificates
answer HTTP 503 except for ACME challenges until a later certificate run.
Normal issuance bootstraps HTTP first and adds HTTPS after certificates exist.

nginx changes are checked with `nginx -t` before reload. A failed render,
reload, or certificate issuance restores the previous configuration. Unrelated
sites are preserved. If rollback itself fails, the error reports a root-only
backup under `/var/backups/testron-nginx.*`. Certificates issued before a later
failure remain on disk and are reused on retry.

SSH is hardened last, after a fresh key-only developer login and `sudo -n true`
succeed. The script prepends its managed include before provider/cloud-init
settings, checks syntax and effective authentication for the three accounts,
and restores the previous files if validation/reload fails. Existing `Match`
rules for other source addresses need review if you customize sshd. Keep your
current terminal open and test a new developer connection after provisioning.

The internal `provision-server.sh` helper is transferred with templates and
public keys in a temporary bundle; use `provision-app.sh` as the entry point.
The script serializes remote phases with `flock`; do not run separate full
provisions concurrently. Provisioning upgrades are separate from OS updates.

## Application deployment and recovery

The production Compose config is `deployment/compose.yml`; Actions copies it
to `/opt/testron/compose.yml`. Runtime secrets still come from GitHub Actions
and are written to `/opt/testron/.env`, separate from local provisioning
settings. See [deployment and GitHub settings](../docs/deployment.md).

For this replacement server, update `VPS_HOST` to the actual public address
(GitHub runners do not know your local `testron` alias), update the pinned
`VPS_KNOWN_HOSTS`, and set `TESTRON_PUBLIC_URL=https://app.testron.dev`. Run the
server workflow and the public-site workflow. A provisioned server can return
502 for the app or 404 for the website until their first deployments.

Provisioning rebuilds infrastructure; it does **not** recover lost data or
implement backups. Before storing new production data, arrange encrypted
off-server PostgreSQL backups, artifact backups, and a separate safe copy of
`TESTRON_AUTH_ENCRYPTION_KEYS`. Test restoring the database and artifacts on a
fresh server. Certificates can be reissued; database and encryption keys cannot.

## Verification

```sh
bash -n deployment/provision-app.sh deployment/provision-server.sh
python3 -B -m unittest discover -s deployment/tests -p 'test_*.py'
docker run --rm -v "$PWD/deployment:/source:ro" debian:13 \
  bash /source/tests/debian.sh
```

The container test installs real Debian/Docker packages and checks repeat runs,
HTTP/TLS nginx configs, ownership, keys, and rollback. It uses a service-control
stub because the container has no systemd, and does not contact Let's Encrypt.
On the actual server, also verify `systemctl status docker nginx certbot.timer`,
developer/deployment key logins, and `sudo certbot renew --dry-run`.
