# Reaction Library for Vencord, Dorion, and Equicord

[Leia em português (Brasil)](README.pt-BR.md)

The Windows setup ZIP includes the `ReactionLibrary-Setup.exe` launcher, which has an English and Portuguese language selector, and guides in both languages.

The chat button opens a Discord themed library. The Dorion plugin's **Add folder** stores references to supported images, GIFs, videos, and audio files. Media stays in its original location. Use **Set save folder** to choose where Discord media should be saved. Right click an image, video, or audio attachment and choose **Add to reaction library** to download it into that folder and add its reference. Folder scanning and indexing show live progress, and items appear after each batch of 20 references. The picker searches file names, folder paths, and user tags; filters by folder and media type; and sorts by name or import time. Clicking an item starts its upload and sends it to the current chat.

The plugin interface follows Discord's selected language for English and Portuguese (Brazilian or European). Other client languages use English. Changing Discord's language updates the picker without restarting the plugin.

## Standalone Dorion plugin

Keep Dorion's built-in Equicord enabled. Copy **only** `dorion/reaction-library.js` into `%USERPROFILE%\dorion\plugins` on Windows (or open the plugins folder from Dorion settings), enable it in Dorion's plugin settings, and restart Dorion. This file contains its own styles and does not replace Equicord. It uses the built-in Equicord's upload API to send files, so Equicord must remain enabled. It appears as a button in chat; it does not appear in Equicord's plugin list.

If you installed the earlier custom Equicord bundle, remove `Equicord-ReactionLibrary.js` from Dorion's plugins folder and `Equicord-ReactionLibrary.css` from its themes folder before enabling this file.

Persistent references require Dorion's folder picker support. If this is unavailable, the picker reports it and does not copy files. On opening the library, the plugin checks saved folder permissions and automatically attempts to restore access while the opening click is still active. Dorion may show a permission prompt that must be approved. If permission cannot be restored automatically, an access notice lists affected folders with **Restore access** buttons; no reimport is needed. Locked thumbnail placeholders distinguish expired access from an empty library. Missing or unreadable folder handles offer **Select folder again**, which reconnects the references and preserves existing tags. Moving or deleting the original file makes its reference unavailable until its folder is selected again.

On the first library open after this update, a one-time cleanup removes old stored media copies, including unlisted leftovers from interrupted imports. It identifies actual Blob/File values, leaving file handles, folder handles, and reference tags intact. Items backed only by removed copies are also removed from the index. Original files on disk are untouched.

Image and video previews load only near the visible area, with at most three file reads in flight. Videos show a frame near the start without autoplay. The picker initially displays 60 items; **Show more** expands the list in batches. Unsupported video codecs retain a video icon.

Clicking a media card still sends the original file immediately. Video and audio cards also have a separate **Preview** button, which opens playback controls without sending. Both offer **Send as voice** to send a Discord voice message with duration and waveform metadata. Video cards and previews additionally offer **Send as GIF**. All conversion output is temporary upload data in memory: no converted media is saved to disk or to the library, and the original remains unchanged.

Each card now keeps secondary actions in a compact menu. Images and GIFs can be sent as spoilers there; audio and video also offer preview, voice, and GIF conversion where applicable. The audio and video preview has a trim timeline with draggable start and end handles for sending a duration clip as a file, spoiler, or voice message. The handles also support arrow keys. File and spoiler clips are recorded in memory as WebM using the client's media support, so recording takes approximately the selected duration and unsupported codecs report an error. Voice clips select the chosen audio interval during voice conversion and do not use the WebM clip recorder.

Preview playback follows the selected trim range. The player's play control seeks to the clip beginning before starting, playback stops at the end, and a playhead on the timeline shows the current position.

Voice conversion uses existing OGG Opus audio directly and encodes other decodable audio to mono Opus when Dorion supports WebCodecs encoding. For videos, it first tries direct audio decoding, then an in-memory capture of the video's audio track. The fallback takes roughly the video's duration, plays silently, and shows progress. Videos with no decodable audio track report an error. Channel voice-message permissions apply.

GIF conversion includes the full video's duration, scaled to at most 480 pixels on the longest side, with up to 10 frames per second. Long videos use fewer frames per second, up to 900 frames total. Frame progress and **Cancel conversion** are available. GIFs exceeding a 64 MiB conversion buffer stop with an error; Discord's own upload limit also applies. GIF encoding is bundled in the single plugin file and requires no runtime download.

Closing the library leaves conversions and uploads running while Dorion remains open. A dot on the chat button indicates a pending send; hovering shows the current status. Reopen the library to see progress or use **Cancel conversion**. Completion sends to the original selected chat even if you switch chats. Background completion or errors show a toast, and a library window reopened during the job stays open. Closing Dorion itself ends these in-memory jobs.

The shared source is `src/reaction-library.js`. After editing it, run `node build.mjs` to regenerate the Dorion bundle and the Vencord runtime using the GIF encoder and build tools already installed in the adjacent Equicord development checkout. This checkout is only a source of development tools; it is not a dependency of the packaged Vencord plugin.

Drag the library's upper-left corner to resize it. The selected size is remembered, the media grid adapts to the width, and the window stays within the screen. The resize handle also supports arrow keys when focused.

Use an item's **Remove** button to remove it from the library, or choose a folder and click **Remove folder** to remove all its indexed items, including subfolders. These operations leave original files untouched. The folder index is refreshed when you add that folder again; it does not watch the filesystem continuously.

## Vencord plugin

For users on Windows x64 with Vencord already installed, run `releases/ReactionLibrary-Setup.exe`, select a language, and click **Download setup**. The EXE fetches the latest published GitHub release, verifies GitHub's SHA-256 asset digests, the published checksum file, and every packaged file, then shows detection, review, progress, and restore controls in the same window. PowerShell runs only as a hidden background worker for the existing safety and build logic. Setup builds separately against the tested revision and backs up the existing build, loader, settings, and themes before applying changes. **Restore previous installation** recovers the verified snapshot. See `installer/README.txt` for requirements and limits.

Run `powershell -NoProfile -ExecutionPolicy Bypass -File package-windows.ps1` to regenerate the Windows setup ZIP and executable after updating `vencord/reactionLibrary`. Publish the EXE, ZIP, and both `.sha256` files as assets of the same GitHub release. Run `powershell -NoProfile -ExecutionPolicy Bypass -File test/installer.test.ps1` and `test/installer-bootstrap.test.ps1` to check the setup and update flow without patching Discord. The launcher requires a public GitHub release with SHA-256 asset digests; it stops if the release is unavailable or invalid.

Use `pwsh -NoProfile -File release-next.ps1 -CommitMessage "Describe the changes"` to build, run automated checks, package the installer, commit all repository changes, push `main`, create the next patch tag, and upload the release assets. PowerShell 7 and an existing Git Credential Manager sign-in for GitHub are required. It publishes a preview release by default. Pass `-Public` to publish a regular release without a VM acceptance record. Pass `-SkipChecks` to omit the automated code and installer tests; the build, packaging, asset presence, and uploaded digest checks still run. Releases made with `-SkipChecks` say so in their notes. Add `-NotesFile path-to-notes` for release notes. If an asset upload fails after the tag is pushed, rerun with `-Tag VERSION -Resume` to finish the draft release. Review the working tree before running because the script stages all repository changes.

Automatic Vencord updating is disabled in helper-built packages so tested custom builds are not silently replaced. Source/custom builds must match the tested Vencord revision; stock version changes are shown before approval and builds that omit existing built-in plugin files are refused. The preview is unsigned until packaged with a code-signing certificate. [Release signing and clean Windows acceptance checks](installer/RELEASING.md) document the remaining release gates; filesystem tests and compilation do not substitute for a live Discord install/update/restore cycle in a disposable VM.

The helper reuses a versioned tool cache after checking every cached file. Successful installs remove temporary source builds, dependency folders and their private store, and duplicate compiled output. Custom-source installations retain a source snapshot for later updates; verified tools and rollback backups remain. The 4 GB free-space check covers temporary build work. `test/installer-storage.test.ps1` checks cache reuse, tamper repair, safe cleanup, and directory-link handling.

The complete maintained plugin is packaged in `vencord/reactionLibrary/`, with a Vencord entry point, native desktop folder access, and the shared runtime including GIF encoding. See that folder's README for installation instructions. Copy the whole folder into `Vencord/src/userplugins/reactionLibrary/` and rebuild Vencord. No Equicord installation or extra GIF dependency is needed to install this package.

Desktop Vencord remembers selected folder paths through its native helper, which reads original files on demand and rejects reads outside selected folders. It writes media downloaded through **Add to reaction library** only into the selected save folder. It does not save converted media or copy imported files.

## Earlier Equicord source plugin

For a normal Equicord desktop build, copy `index.tsx` and `styles.css` to `src/userplugins/reactionLibrary` in an Equicord checkout and build that checkout. With Equicord's dependencies installed in an adjacent `Equicord` folder, run `node check.mjs` here to type check the source plugin without copying files.

The Equicord source plugin still uses copied media and does not include the standalone Dorion plugin's conversion features. GIFs are included in the image filter. Run `node --test test/standalone.test.cjs` to check large reference imports, interrupted batches, preview limits, library removal, conversion outputs, and send routing.

The plugin metadata currently uses `Devs.Ven` as a compilation placeholder because no contributor identity was supplied. Replace it with your entry in Equicord's developer list before distributing the plugin.

## Development and license

Development currently uses dependencies from an adjacent Equicord checkout: clone this repository and Equicord side by side, then install Equicord's dependencies using its documented pnpm workflow. Run `node build.mjs` to build both current plugin packages, `node --test test/*.test.cjs` to run their tests, and Equicord's ESLint executable with this repository as the working directory to lint `src/*.js`.

The shared runtime in `src/reaction-library.js` coordinates the library UI, storage, and send flow. `src/media-source.js` handles context-menu media identification, download retry rules, and filenames. `src/folder-identity.js` keeps library folder keys unique while displaying the real directory name. `src/media-conversion.js` handles clip recording, GIF conversion, and video audio extraction. `src/voice-codec.js` handles voice encoding. `src/discord-sender.js` handles Discord file and voice uploads. `src/localization.js` handles English and Portuguese text. The build bundles these modules into both Dorion and Vencord outputs; Vencord's native helper separately enforces disk access.

Licensed under GPL-3.0-or-later. The generated standalone plugin also includes gifenc under its MIT license; that license is embedded in the generated file. The standalone plugin is the actively developed version; the Equicord source plugin is an earlier implementation.
