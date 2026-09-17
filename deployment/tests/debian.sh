#!/usr/bin/env bash
# Destructive to its filesystem: run ONLY in a fresh disposable Debian container.
set -euo pipefail
[ -f /.dockerenv ] || { echo 'Run in a disposable Docker container' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
expect_response() {
  local expected=$1 actual='' _attempt
  shift
  for _attempt in {1..30}; do
    actual=$(curl -s "$@")
    [ "$actual" != "$expected" ] || return 0
    sleep 0.1
  done
  printf 'Expected %s, got %s\n' "$expected" "$actual" >&2
  return 1
}
apt-get update -qq
apt-get install -y -qq openssh-server openssl shellcheck ca-certificates curl
rm -rf /work
cp -R /source /work
cd /work
shellcheck provision-app.sh provision-server.sh tests/debian.sh
mkdir -p /run/sshd /var/backups
ssh-keygen -A
rm -f /tmp/test-key /tmp/test-key.pub
ssh-keygen -q -t ed25519 -N '' -f /tmp/test-key
cp /tmp/test-key.pub DEPLOY_KEY_FILE
cp /tmp/test-key.pub DEVELOPER_KEYS_FILE
cat > settings.sh <<'EOF'
MODE=full
SKIP_CERTS=1
DEVELOPER_USER=developer
PERMIT_ROOT_LOGIN=prohibit-password
CERT_EMAIL=test@example.com
INCLUDE_WWW=0
SLANG_API_KEY=
EOF
# Exercise real nginx config validation/reloads without systemd in the container.
cat > /usr/bin/systemctl <<'EOF'
#!/bin/sh
echo "$*" >> /tmp/service-calls
case "$*" in
  'enable --now docker nginx certbot.timer') nginx 9>&- ;;
  'reload nginx') nginx -s reload ;;
esac
EOF
chmod +x /usr/bin/systemctl
bash provision-server.sh /work prepare
touch /data/testron/db/keep-me /data/testron/artifacts/keep-me
# Repeat service enable must also be idempotent, as real systemd is.
sed -i "s/) nginx 9/) test -f \/run\/nginx.pid || nginx 9/" /usr/bin/systemctl
bash provision-server.sh /work prepare
test -f /data/testron/db/keep-me
test -f /data/testron/artifacts/keep-me
test "$(stat -c %u /data/testron/artifacts)" = 1000
test "$(grep -c '^ssh-' /home/github/.ssh/authorized_keys)" = 1
test "$(grep -c '^ssh-' /home/developer/.ssh/authorized_keys)" = 1
id -nG github | grep -qw docker
sudo -u developer sudo -n true
expect_response 503 -o /dev/null -w '%{http_code}' -H 'Host: app.testron.dev' http://127.0.0.1/
mkdir -p /var/www/certbot/.well-known/acme-challenge
echo challenge > /var/www/certbot/.well-known/acme-challenge/test
expect_response challenge -H 'Host: testron.dev' http://127.0.0.1/.well-known/acme-challenge/test

# Config-only mode must refuse missing certificates before changing nginx.
sed -i 's/MODE=full/MODE=nginx/; s/SKIP_CERTS=1/SKIP_CERTS=0/' settings.sh
cp -a /etc/nginx /tmp/before
if bash provision-server.sh /work prepare; then exit 1; fi
diff -r /tmp/before /etc/nginx
rm -rf /tmp/before
for name in app.testron.dev testron.dev; do
  mkdir -p "/etc/letsencrypt/live/$name"
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=$name" \
    -keyout "/etc/letsencrypt/live/$name/privkey.pem" \
    -out "/etc/letsencrypt/live/$name/fullchain.pem" 2>/dev/null
done
echo 'server { listen 8088; server_name unrelated; return 200 "untouched"; }' > /etc/nginx/conf.d/unrelated.conf
bash provision-server.sh /work prepare
nginx -t
curl -fsS http://127.0.0.1:8088/ | grep -q untouched
mkdir -p /var/www/testron.dev/releases/test
echo website > /var/www/testron.dev/releases/test/index.html
ln -s releases/test /var/www/testron.dev/current
expect_response website -k --resolve testron.dev:443:127.0.0.1 https://testron.dev/
expect_response 503 -k -o /dev/null -w '%{http_code}' --resolve app.testron.dev:443:127.0.0.1 https://app.testron.dev/slang/api/translations
expect_response 404 -k -o /dev/null -w '%{http_code}' --resolve app.testron.dev:443:127.0.0.1 https://app.testron.dev/slang/api/push
echo '127.0.0.1 slang.warpunit.com' >> /etc/hosts
sed -i 's/SLANG_API_KEY=/SLANG_API_KEY=test-key/' settings.sh
bash provision-server.sh /work prepare
test "$(stat -c %a /etc/nginx/snippets/testron-slang.conf)" = 600
expect_response 403 -k -X POST -o /dev/null -w '%{http_code}' --resolve app.testron.dev:443:127.0.0.1 https://app.testron.dev/slang/api/translations

# Invalid nginx template must restore every previous file, including other sites.
cp -a /etc/nginx /tmp/before
cp nginx/testron.dev.conf /tmp/site-template
echo 'invalid_directive;' >> nginx/testron.dev.conf
if bash provision-server.sh /work prepare; then exit 1; fi
diff -r /tmp/before /etc/nginx
cp /tmp/site-template nginx/testron.dev.conf
rm -rf /tmp/before
test -z "$(compgen -G '/var/backups/testron-nginx.*' || true)"

# A failed ACME request must roll back the config too. No real ACME requests.
sed -i 's/MODE=nginx/MODE=certs/' settings.sh
cp -a /etc/nginx /tmp/before
mv /usr/bin/certbot /usr/bin/certbot.real
printf '#!/bin/sh\nexit 1\n' > /usr/bin/certbot
chmod +x /usr/bin/certbot
if bash provision-server.sh /work prepare; then exit 1; fi
diff -r /tmp/before /etc/nginx
rm -rf /tmp/before
test -z "$(compgen -G '/var/backups/testron-nginx.*' || true)"

# SSH hardening must override cloud-init, remain idempotent and roll back errors.
echo 'PasswordAuthentication yes' > /etc/ssh/sshd_config.d/50-cloud-init.conf
bash provision-server.sh /work harden
bash provision-server.sh /work harden
test "$(grep -c '^Include /etc/ssh/testron-hardening.conf$' /etc/ssh/sshd_config)" = 1
sshd -T | grep -x 'passwordauthentication no' >/dev/null
sshd -T | grep -x 'kbdinteractiveauthentication no' >/dev/null
printf '\nMatch User github\n    PasswordAuthentication yes\n' >> /etc/ssh/sshd_config
cp /etc/ssh/sshd_config /tmp/sshd-before
if bash provision-server.sh /work harden; then exit 1; fi
cmp /tmp/sshd-before /etc/ssh/sshd_config
test -z "$(compgen -G '/var/backups/testron-ssh.*' || true)"
echo 'Debian provisioning integration checks passed'
