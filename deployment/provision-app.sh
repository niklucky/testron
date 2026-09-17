#!/usr/bin/env bash
# Workstation entry point; compatible with macOS Bash 3.2.
set -euo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'HELP'
Usage: deployment/provision-app.sh [options]
  --host=HOST           Override SSH_TARGET (SSH alias or USER@HOST)
  --env=NAME            Read .env.NAME (default: production)
  --nginx-only          Config/reload only; requires existing certificates
  --certs-only          Configure nginx and issue/renew certificates only
  --skip-certs          Full run without issuance; missing TLS sites serve 503
                       on HTTP, with the ACME challenge path still available
  --skip-hardening      Full run without changing SSH authentication
  -h, --help            Show this help
Full runs install packages, accounts, directories, nginx, TLS and SSH hardening.
No private deployment key is uploaded. No application deployment is performed.
HELP
}
MODE=full; SKIP_CERTS=0; SKIP_HARDENING=0; ENV_NAME=production
for arg in "$@"; do
  case "$arg" in
    --nginx-only|--certs-only)
      [ "$MODE" = full ] || die 'Select only one mode'
      MODE=${arg#--}; MODE=${MODE%-only} ;;
    --skip-certs) SKIP_CERTS=1 ;;
    --skip-hardening) SKIP_HARDENING=1 ;;
    --host=*) SSH_TARGET=${arg#*=} ;;
    --env=*) ENV_NAME=${arg#*=} ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $arg" ;;
  esac
done
[[ "$ENV_NAME" =~ ^[a-zA-Z0-9_-]+$ ]] || die 'Invalid environment name'
if [ "$MODE" != full ] && { [ "$SKIP_CERTS" = 1 ] || [ "$SKIP_HARDENING" = 1 ]; }; then
  die '--skip flags apply only to a full run'
fi
ENV_FILE="$HERE/.env.$ENV_NAME"
# Read only known literal assignments. Never execute the settings file.
setting() {
  local name=$1 value=${2-} line
  if [ "${!name+x}" = x ]; then return; fi
  if [ -f "$ENV_FILE" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      line=${line%$'\r'}
      case "$line" in "$name="*) value=${line#*=} ;; esac
    done < "$ENV_FILE"
  fi
  case "$value" in \"*\") value=${value#\"}; value=${value%\"} ;; \'*\') value=${value#\'}; value=${value%\'} ;; esac
  printf -v "$name" '%s' "$value"
}
setting SSH_TARGET testron
setting SSH_PORT
setting SSH_IDENTITY_FILE
setting DEPLOY_KEY_FILE github_id_rsa.pub
setting DEVELOPER_KEYS_FILE developer_keys.pub
setting DEVELOPER_USER developer
setting PERMIT_ROOT_LOGIN prohibit-password
setting CERT_EMAIL
setting INCLUDE_WWW 0
setting SLANG_API_KEY
[[ "$SSH_TARGET" =~ ^([a-z_][a-z0-9_-]*@)?[a-zA-Z0-9][a-zA-Z0-9._-]*$ ]] || die 'Set SSH_TARGET to an SSH alias or user@host'
if [ -n "$SSH_PORT" ]; then
  [[ "$SSH_PORT" =~ ^[0-9]{1,5}$ ]] || die 'Invalid SSH_PORT'
  if [ "$SSH_PORT" -eq 0 ] || [ "$SSH_PORT" -gt 65535 ]; then die 'Invalid SSH_PORT'; fi
fi
[[ "$DEVELOPER_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || die 'Invalid developer username'
[ "${#DEVELOPER_USER}" -le 32 ] || die 'Developer username is too long'
case "$DEVELOPER_USER" in root|github) die 'Developer must be distinct from root and github' ;; esac
case "$PERMIT_ROOT_LOGIN" in no|prohibit-password) ;; *) die 'PERMIT_ROOT_LOGIN must be no or prohibit-password' ;; esac
case "$INCLUDE_WWW" in 0|1) ;; *) die 'INCLUDE_WWW must be 0 or 1' ;; esac
[[ "$SLANG_API_KEY" =~ ^[a-zA-Z0-9_.:-]*$ ]] || die 'Invalid characters in SLANG_API_KEY'
if [ "$MODE" != nginx ] && [ "$SKIP_CERTS" = 0 ]; then
  [[ "$CERT_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || die 'Set CERT_EMAIL for certificate registration'
fi
for cmd in ssh ssh-keygen tar mktemp; do command -v "$cmd" >/dev/null || die "Missing local command: $cmd"; done
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=15)
if [ -n "$SSH_PORT" ]; then ssh_opts+=(-p "$SSH_PORT"); fi
if [ -n "$SSH_IDENTITY_FILE" ]; then
  [ -f "$SSH_IDENTITY_FILE" ] || die 'SSH_IDENTITY_FILE does not exist'
  ssh_opts+=(-i "$SSH_IDENTITY_FILE" -o IdentitiesOnly=yes)
fi
# Arguments are remote command strings built below from validated/quoted values.
# shellcheck disable=SC2029
remote() { ssh "${ssh_opts[@]}" "$SSH_TARGET" "$@"; }
bundle=$(mktemp -d)
stage=''
cleanup() {
  local rc=$?
  trap - EXIT
  if [ -n "$stage" ]; then remote "rm -rf -- '$stage'" >/dev/null 2>&1 || true; fi
  rm -rf "$bundle"
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
umask 077
cp "$HERE/provision-server.sh" "$bundle/"
cp -R "$HERE/nginx" "$bundle/"
if [ "$MODE" = full ]; then
  for name in DEPLOY_KEY_FILE DEVELOPER_KEYS_FILE; do
    path=${!name}
    case "$path" in /*) ;; *) path="$HERE/$path" ;; esac
    [ -s "$path" ] || die "Missing public key file: $path"
    count=0
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in ''|'#'*) continue ;; esac
      # Require plain public keys, not private keys or authorized_keys options.
      [[ "$line" =~ ^(ssh-|ecdsa-|sk-) ]] || die "Expected public key in $path"
      printf '%s\n' "$line" > "$bundle/check.pub"
      ssh-keygen -lf "$bundle/check.pub" >/dev/null || die "Invalid public key in $path"
      printf '%s\n' "$line" >> "$bundle/$name"
      count=$((count + 1))
    done < "$path"
    [ "$count" -gt 0 ] || die "No public keys in $path"
  done
  rm -f "$bundle/check.pub"
fi
# Bash-escaped assignments generated from validated values; no secrets in argv.
for name in MODE SKIP_CERTS DEVELOPER_USER PERMIT_ROOT_LOGIN CERT_EMAIL INCLUDE_WWW SLANG_API_KEY; do
  printf '%s=%q\n' "$name" "${!name}" >> "$bundle/settings.sh"
done
printf 'Provisioning %s (%s)\n' "$SSH_TARGET" "$MODE"
uid=$(remote id -u)
sudo_cmd=''
if [ "$uid" != 0 ]; then sudo_cmd='sudo -n'; remote 'sudo -n true'; fi
stage=$(remote 'umask 077; mktemp -d /tmp/testron-provision.XXXXXXXX')
[[ "$stage" =~ ^/tmp/testron-provision\.[a-zA-Z0-9]+$ ]] || die 'Unexpected remote staging path'
tar_opts=()
if [ "$(uname)" = Darwin ]; then tar_opts+=(--no-mac-metadata --no-xattrs); fi
COPYFILE_DISABLE=1 tar "${tar_opts[@]}" -C "$bundle" -cf - . | remote "tar -C '$stage' -xf -"
run_phase() { remote "$sudo_cmd bash '$stage/provision-server.sh' '$stage' '$1'"; }
run_phase prepare
if [ "$MODE" = full ] && [ "$SKIP_HARDENING" = 0 ]; then
  # A real new connection proves that the installed human key and sudo work.
  ssh "${ssh_opts[@]}" -o ControlMaster=no -o ControlPath=none \
    -o PreferredAuthentications=publickey -l "$DEVELOPER_USER" "${SSH_TARGET#*@}" 'sudo -n true' \
    || die 'Developer key login/sudo failed; SSH hardening was not applied'
  # Clean up on the same connection: root login may be disabled by this phase.
  remote "$sudo_cmd bash '$stage/provision-server.sh' '$stage' harden && rm -rf -- '$stage'"
  stage=''
fi
printf 'Completed %s provisioning on %s.\n' "$MODE" "$SSH_TARGET"
if [ "$MODE" = full ]; then
  printf 'Deploy as github; human access: ssh %s-l %s %s\n' "${SSH_PORT:+-p $SSH_PORT }" "$DEVELOPER_USER" "${SSH_TARGET#*@}"
  [ "$SKIP_HARDENING" = 0 ] || printf 'SSH hardening was skipped.\n'
fi
