REACTION LIBRARY - SAFER VENCORD SETUP (PREVIEW)

1. Fully exit Discord, including its tray icon. Vencord must already be installed.
2. Run ReactionLibrary-Setup.exe and choose English. Click Download setup. It
   downloads and verifies the latest public GitHub release, then shows the setup
   review and progress in the same window. PowerShell runs hidden in the background.
3. Check the detected Discord resources folder. Select a different one if needed.
4. If custom plugins are detected, select the matching Vencord source checkout
   if setup cannot find it automatically.
5. Click Review / Install. Read the old/new Vencord revision and affected paths,
   then approve the change. Wait for build, type checking, backup, and installation.
6. Restart Discord. Enable ReactionLibrary under Settings > Vencord > Plugins.

WHAT THIS CHANGES

This version requires an existing, recognized upstream Vencord installation on
Windows x64 desktop Discord. It leaves Discord's loader in place and updates
only the compiled Vencord dist folder that loader already uses. It does not
install a second mod or repatch Discord. Stock Discord must have Vencord installed
first through vencord.dev. Unknown loader formats, network shares, linked build
folders, and missing source maps are refused. Dorion, Vesktop, ARM64, and browser
clients are not supported by this Windows installer.

Built-in plugins remain included. Existing settings and themes stay at their
current paths; the installer also backs them up before switching builds.
The new build is pinned to Vencord revision b0e636d, with pinned Node, Git, pnpm,
and dependency lockfile. If your stock build is newer or older, the review dialog
shows the version change. Setup refuses a build that would lose an existing
built-in plugin file. This can mean a newer stock installation must wait for a
new tested package rather than downgrade.

Source/custom builds must match the tested revision. Their complete source is
snapshotted separately, including local changes and other userplugins; .git,
node_modules, and prior build output are excluded. The original source files are
not edited; its compiled dist output is replaced if that is the build Discord loads.
Missing custom source and linked source files stop installation.
Custom builds can still fail compilation; active files are not changed in that case.

Installation creates a backup and crash-recovery journal before renaming the
compiled build. It checks that Discord is closed and that the existing build and
loader have not changed. This is not a power-loss-proof transaction: an
interrupted switch can require the Restore button. Nothing is recursively deleted
from your active installation. Rollback snapshots are retained.

RESTORE

Close Discord, run ReactionLibrary-Setup.exe, and click Restore previous installation.
The review dialog identifies the previous snapshot. Restore verifies its hashes,
then restores the saved build, settings, and themes. Settings/themes changed since
installation are first preserved in a separate rescued folder. Discord's loader
is not changed. If Discord updated or its loader changed, automatic restore stops
rather than apply an old snapshot to a different installation; use the official
Vencord installer to repair that installation instead.

Backups, logs, builds, portable tools, and the recovery journal are under:
  %LOCALAPPDATA%\ReactionLibrarySetup
Do not delete rollback snapshots while relying on Restore. At least 4 GB free is
required during building; this is temporary working space, not a permanent allocation.
After a successful install, temporary builds, node_modules, the private dependency
store, and duplicate held output are removed. Custom-source installs retain only
the source snapshot needed to preserve those plugins on future updates. Verified
tools are reused; every cached tool file is checked before execution, and changed
caches are rebuilt from pinned downloads. Rollback backups, rescued settings,
logs, tool archives, and source snapshots can still grow across updates. Failed or
validation-only builds are kept for diagnosis; cleanup failures are shown in the log.
Restore snapshots contain settings and themes and should be treated as private.

UPDATES AND TRUST

Automatic Vencord updating is disabled in this custom build to avoid replacing it
with untested code or removing ReactionLibrary. Run ReactionLibrary-Setup.exe
again for an explicit, reviewed update. The Get latest release button starts
the same download flow. The launcher requires a public release containing the
ZIP and its SHA-256 file. A private repository or missing release causes it to
stop. The bundled Setup.ps1 may still be run directly for an offline install.

Every run verifies bundled file hashes, then verifies pinned upstream download
hashes before extracting tools or reuses the verified tool cache. Tools are portable; system Node, Git, or pnpm
installations are not changed. Locked dependencies execute their normal build
scripts. Only run a package from someone you trust: hashes alone do not establish
publisher identity. The current preview is UNSIGNED unless distributed with a
verifiable publisher signature. Windows may warn about the scripts. Organization
policy may block them; do not bypass your administrator's restrictions.

The launcher checks GitHub's SHA-256 digests, the release's SHA-256 file, and
every file listed inside the ZIP. These checks detect changed downloads, but
they do not authenticate the publisher independently of the GitHub account.
An unsigned release requires a separate confirmation before its setup runs.
The downloaded setup always shows a review before changing active files.

There is no certificate bundled with this preview. Signed releases can provide a
detached .p7s plus Verify-Release.ps1. Obtain the publisher's certificate thumbprint
through a separately trusted channel, then verify before extracting/running:
  .\Verify-Release.ps1 -Zip .\ReactionLibrary-Windows-Setup.zip -ExpectedSignerThumbprint THUMBPRINT

VALIDATION LIMITS

Automated tests exercise real filesystem installation, preservation, restore,
corruption refusal, and interrupted-switch recovery using fake Discord archives.
The plugin has compiled against upstream Vencord. A complete clean Windows VM
install/update/restore cycle with a running Discord client is still a release
acceptance step. Until that passes, this is a preview for testers, not a claim of
zero risk. Installer/RELEASING.md in the project documents signing and VM checks.

Project: https://github.com/K0kai/reaction_library_plugin
GPL-3.0-or-later. See reactionLibrary/LICENSE and its embedded gifenc MIT license.
