"""Exercise the real rollback function with failing filesystem/service commands."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class RollbackTests(unittest.TestCase):
    def test_cleanup_requires_every_restore_step_to_succeed(self):
        """Keep failed backups, clean successful branches, and retain exit status."""
        source = (Path(__file__).resolve().parents[1] / "provision-server.sh").read_text()
        rollback = source[source.index("rollback() {"):source.index("\ntrap rollback EXIT")]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            nginx_backup = root / "nginx-backup"
            ssh_backup = root / "ssh-backup"
            nginx_backup.mkdir()
            ssh_backup.mkdir()
            log = root / "calls"
            nginx_steps = [
                "rm -rf /etc/nginx",
                f"cp -a {nginx_backup}/nginx /etc/nginx",
                "nginx -t",
                "systemctl reload nginx",
                f"rm -rf {nginx_backup}",
            ]
            for prior_hardening in (False, True):
                if prior_hardening:
                    (ssh_backup / "testron-hardening.conf").write_text("PasswordAuthentication no\n")
                ssh_steps = [
                    f"cp -a {ssh_backup}/sshd_config /etc/ssh/sshd_config",
                    "rm -f /etc/ssh/testron-hardening.conf",
                    *([f"cp -a {ssh_backup}/testron-hardening.conf /etc/ssh/"] if prior_hardening else []),
                    "sshd -t",
                    "systemctl reload ssh",
                    f"rm -rf {ssh_backup}",
                ]
                for failed_command in ["", *nginx_steps, *ssh_steps]:
                    with self.subTest(prior_hardening=prior_hardening, failure=failed_command):
                        log.write_text("")
                        script = r'''
set -euo pipefail
record() { printf '%s\n' "$*" >> "$LOG"; [ "$*" != "$FAIL_COMMAND" ]; }
rm() { record rm "$@"; }
cp() { record cp "$@"; }
nginx() { record nginx "$@"; }
sshd() { record sshd "$@"; }
systemctl() { record systemctl "$@"; }
reload_ssh() { systemctl reload ssh; }
nginx_pending=1; ssh_pending=1
nginx_backup=$NGINX_BACKUP; ssh_backup=$SSH_BACKUP
''' + rollback + '\ntrap rollback EXIT\nexit 37\n'
                        result = subprocess.run(
                            ["bash", "-c", script], text=True, capture_output=True,
                            env={**os.environ, "LOG": str(log), "FAIL_COMMAND": failed_command,
                                 "NGINX_BACKUP": str(nginx_backup), "SSH_BACKUP": str(ssh_backup)},
                        )
                        self.assertEqual(result.returncode, 37, result.stderr)
                        expected = []
                        for steps, backup in ((nginx_steps, nginx_backup), (ssh_steps, ssh_backup)):
                            if failed_command in steps:
                                expected.extend(steps[:steps.index(failed_command) + 1])
                                self.assertIn(f"backup retained at {backup}", result.stderr)
                            else:
                                expected.extend(steps)
                                self.assertNotIn(f"backup retained at {backup}", result.stderr)
                        self.assertEqual(log.read_text().splitlines(), expected)


if __name__ == "__main__":
    unittest.main()
