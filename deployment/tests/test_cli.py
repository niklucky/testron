"""Local preflight tests: never connect to a server."""

import os
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class ProvisionCLI(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        source = Path(__file__).resolve().parents[1]
        for name in ("provision-app.sh", "provision-server.sh"):
            shutil.copy(source / name, self.root / name)
        shutil.copytree(source / "nginx", self.root / "nginx")
        self.env = {"PATH": os.environ["PATH"], "HOME": os.environ["HOME"]}

    def tearDown(self):
        self.temp.cleanup()

    def run_cli(self, *args, **env):
        return subprocess.run(
            ["bash", str(self.root / "provision-app.sh"), *args],
            env={**self.env, **env}, text=True, capture_output=True,
        )

    def test_help_needs_no_settings_or_keys(self):
        self.assertEqual(self.run_cli("--help").returncode, 0)

    def test_invalid_options_fail_before_ssh(self):
        for args in (("--what",), ("--env=../bad",),
                     ("--certs-only", "--nginx-only"),
                     ("--nginx-only", "--skip-certs")):
            self.assertNotEqual(self.run_cli(*args).returncode, 0)

    def test_missing_keys_fail_before_ssh(self):
        result = self.run_cli("--skip-certs")
        self.assertIn("Missing public key file", result.stderr)

    def test_settings_are_literal_and_environment_wins(self):
        sentinel = self.root / "executed"
        (self.root / ".env.production").write_text(
            f"SSH_TARGET=$(touch {sentinel})\nCERT_EMAIL=\n"
        )
        self.assertIn("Set SSH_TARGET", self.run_cli("--skip-certs").stderr)
        result = self.run_cli("--skip-certs", SSH_TARGET="testron")
        self.assertIn("Missing public key file", result.stderr)
        self.assertFalse(sentinel.exists())

    def test_private_key_is_rejected(self):
        (self.root / "github_id_rsa.pub").write_text(
            "-----BEGIN OPENSSH PRIVATE KEY-----\n"
        )
        self.assertIn("Expected public key", self.run_cli("--skip-certs").stderr)

    def test_nginx_only_does_not_need_keys_or_cert_email(self):
        # Trap the first SSH invocation locally. Check that preflight reached it.
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        ssh = bin_dir / "ssh"
        ssh.write_text("#!/bin/sh\necho intercepted-ssh >&2\nexit 42\n")
        ssh.chmod(0o755)
        result = self.run_cli("--nginx-only", PATH=f"{bin_dir}:{self.env['PATH']}")
        self.assertEqual(result.returncode, 42)
        self.assertIn("intercepted-ssh", result.stderr)

    def test_bundle_and_ssh_alias_on_full_run(self):
        subprocess.run(
            ["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f",
             str(self.root / "github_id_rsa")], check=True,
        )
        shutil.copy(self.root / "github_id_rsa.pub", self.root / "developer_keys.pub")
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        unpacked = self.root / "bundle"
        unpacked.mkdir()
        log = self.root / "ssh.log"
        ssh = bin_dir / "ssh"
        ssh.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, subprocess, sys\n"
            "with open(os.environ['SSH_TEST_LOG'], 'a') as f:\n"
            "    f.write(json.dumps(sys.argv[1:]) + '\\n')\n"
            "command = sys.argv[-1]\n"
            "if command == 'id -u': print('0')\n"
            "elif 'mktemp -d' in command: print('/tmp/testron-provision.test')\n"
            "elif command.startswith('tar -C '):\n"
            "    subprocess.run(['tar', '-xf', '-', '-C', os.environ['SSH_TEST_BUNDLE']], check=True)\n"
        )
        ssh.chmod(0o755)
        result = self.run_cli(
            "--skip-certs", PATH=f"{bin_dir}:{self.env['PATH']}",
            SSH_TEST_LOG=str(log), SSH_TEST_BUNDLE=str(unpacked),
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((unpacked / "github_id_rsa").exists())
        self.assertTrue((unpacked / "DEPLOY_KEY_FILE").exists())
        calls = [json.loads(line) for line in log.read_text().splitlines()]
        self.assertTrue(all("-p" not in call for call in calls))
        developer = next(call for call in calls if "-l" in call)
        self.assertEqual(developer[-4:], ["-l", "developer", "testron", "sudo -n true"])


if __name__ == "__main__":
    unittest.main()
