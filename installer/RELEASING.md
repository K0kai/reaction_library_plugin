# Release checks and signing

`toolchain.json` pins Vencord, Node, Git, pnpm and their download hashes. Do not
change the Vencord revision without repeating the clean-build and client tests.
Dependency resolution uses the pinned Vencord lockfile. Upstream downloads are
not silently substituted if a pinned file disappears or fails verification.

Optional automated checks:

```powershell
node --test test/*.test.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File test/installer.test.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File test/installer-storage.test.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File test/installer-bootstrap.test.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File package-windows.ps1
```

The current ZIP is **unsigned** unless explicitly built with a signing certificate.
For a signed release, obtain a publicly trusted code-signing certificate, install
it with its private key in CurrentUser/My, and build with:

```powershell
.\package-windows.ps1 -SigningCertificateThumbprint YOUR_CERTIFICATE_THUMBPRINT
```

This signs the setup PowerShell scripts and launcher EXE with Authenticode and a timestamp, and
produces a detached CMS signature for the complete ZIP. Publish the EXE, ZIP,
both SHA-256 files, `.p7s`, and `Verify-Release.ps1` together. Communicate the publisher certificate
thumbprint through a separately trusted channel. A checksum by itself is not
proof of publisher identity. The CMS ZIP signature is not timestamped; certificate
expiry requires re-signing/reissuing the ZIP. Keep the signing key out of GitHub
and out of the ZIP. Never replace a release asset after announcing its checksum.

The launcher queries GitHub's latest public release. Confirm its assets have SHA-256
digests in the release API, and enable release immutability when publishing.
Digest checks do not replace a trusted publisher signature. Until a signed
release exists, the automatic download flow remains a preview.
A signed launcher requires downloaded setup scripts signed by the same publisher.
An unsigned launcher asks the user to approve a valid new publisher certificate
or explicitly accept an unsigned preview.

Consumers can verify a signed ZIP before extracting/running anything:

```powershell
.\Verify-Release.ps1 -Zip .\ReactionLibrary-Windows-Setup.zip -ExpectedSignerThumbprint PUBLISHER_THUMBPRINT
```

## Optional clean Windows acceptance test

Use a disposable Windows x64 VM or Windows Sandbox with networking. Do not map
the host's Discord, AppData, media, or source checkout into it with write access.
The `New-TestSandbox.ps1` helper creates a sandbox configuration with just the
setup package mapped read-only. Windows Sandbox must already be installed.

1. Install Discord and stock Vencord inside the disposable environment.
2. Enable several built-in plugins, change their settings, and add a theme.
3. Close Discord. Run setup and inspect the detected build/version-change summary.
4. Confirm install; verify ReactionLibrary works and built-in settings/theme remain.
5. Re-run the same package to exercise update; change settings; use Restore.
   Confirm the tools are reused after verification, temporary dependencies/source
   builds are removed after success, and Restore still works after cleanup.
6. Verify the previous build and settings return, and newer settings are rescued.
7. Repeat with a custom source build at the pinned revision, including local edits.
8. Check refusal with Discord running, unknown loaders, and missing custom source.
9. Run the EXE in the VM. Check both languages, download verification,
   review, installation progress, restore, and repeat update in the same window.
   Confirm no PowerShell or command window appears in front of the EXE.
10. Check offline/download failures, changed digests, malicious ZIPs, and recovery after stopping setup during a
   switch. Keep process-interruption experiments inside the disposable VM.

Filesystem integration tests exercise the actual backup/switch/restore code on
fake Discord archives, including crash recovery. A clean build/type check is
additional evidence; neither proves successful operation in a live Discord client.
Record the OS, Discord version, Vencord revision, installer ZIP hash, and results
before describing a release as live-client tested. The release script does not
require this record for a regular release. If you skip the test, avoid claiming
that the installer was verified in a live Discord client.
