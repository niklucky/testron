# macOS signing and notarization

Testron is distributed directly as a ZIP rather than through the Mac App Store.
Every public macOS build must therefore be signed with a **Developer ID
Application** certificate and notarized by Apple. Electron Forge performs both
operations during the package step; GitHub Actions supplies the credentials.

No provisioning profile is needed for the app's current capabilities. A
Developer ID Installer certificate is also unnecessary unless distribution
changes from ZIP to a signed `.pkg` installer.

## 1. Create the Developer ID Application certificate

The Apple Developer Program Account Holder can create this certificate. The
easiest route on the Mac that will own the private key is:

1. Open Xcode, then **Xcode → Settings → Accounts**.
2. Select the Apple Account and the correct developer team.
3. Click **Manage Certificates**.
4. Click **+**, then select **Developer ID Application**.
5. Confirm that the identity is available locally:

   ```sh
   security find-identity -v -p codesigning
   ```

   The output must contain `Developer ID Application: <team name> (<team ID>)`.

If Xcode cannot create it, use Apple Developer's **Certificates, Identifiers &
Profiles → Certificates → + → Developer ID → Developer ID Application** flow.
Create and upload the requested CSR with **Keychain Access → Certificate
Assistant → Request a Certificate From a Certificate Authority**, download the
`.cer`, and double-click it to install it. The certificate must appear under
**My Certificates** with an attached private key.

## 2. Export the signing identity

In Xcode's **Manage Certificates** window, Control-click the Developer ID
Application certificate and choose **Export Certificate**. Save it as a `.p12`
file and give it a strong, unique export password.

Alternatively, in Keychain Access select the Developer ID Application identity
under **My Certificates**, choose **File → Export Items**, select PKCS#12, and
set the export password.

The `.p12` contains the private signing key. Do not commit it, upload it as a
workflow artifact, or share its password outside the repository administrators.

## 3. Create the notarization password

1. Sign in at <https://account.apple.com/> with the Apple Account used for
   notarization. Two-factor authentication must be enabled.
2. Open **Sign-In and Security → App-Specific Passwords**.
3. Generate one named `Testron GitHub notarization` and copy it immediately.

This is not the normal Apple Account password. Changing the normal account
password revokes all app-specific passwords, so create a replacement GitHub
secret afterward if that happens.

## 4. Find the Team ID

Open <https://developer.apple.com/account/>, select **Membership details**, and
copy the 10-character **Team ID**. It is also the value in parentheses in the
`security find-identity` output above.

## 5. Add GitHub Actions secrets

Open the GitHub repository, then **Settings → Secrets and variables → Actions →
New repository secret**. Add these five secrets:

| Secret                        | Value                                        |
| ----------------------------- | -------------------------------------------- |
| `MACOS_CERTIFICATE`           | Base64 representation of the exported `.p12` |
| `MACOS_CERTIFICATE_PASSWORD`  | Password chosen while exporting the `.p12`   |
| `APPLE_ID`                    | Apple Account email used for notarization    |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from step 3            |
| `APPLE_TEAM_ID`               | 10-character Team ID from step 4             |

On macOS, copy the certificate's base64 value directly to the clipboard:

```sh
base64 -i ~/Downloads/Testron-Developer-ID.p12 | pbcopy
```

Paste that clipboard value into `MACOS_CERTIFICATE`. The encoded value is still
sensitive because it contains the encrypted private key.

## 6. Test and release

First run **Actions → Release → Run workflow**. A manual run builds the four
artifacts without publishing a GitHub Release. Both macOS jobs must pass the
`Verify signed and notarized macOS app` step.

Download and unpack one macOS artifact, then optionally verify it again:

```sh
codesign --verify --deep --strict --verbose=4 /path/to/Testron.app
xcrun stapler validate /path/to/Testron.app
spctl --assess --type execute --verbose=4 /path/to/Testron.app
```

After the manual run succeeds, publish normally:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The workflow imports the signing identity into an ephemeral keychain, signs the
app with hardened runtime, submits it to Apple's notary service, staples the
ticket, verifies all three layers, creates the ZIP, and deletes the keychain.
