# Reaction Library for Vencord

By K0kai. A custom Vencord plugin for a local image, GIF, video, and audio reaction library with folders, search, sorting, tags, previews, and in-memory video-to-GIF and audio/video-to-voice-message conversion.

## Install

Vencord custom plugins must be included in a source build. This folder is a plugin package, not a complete replacement for Vencord and not a file that the stock Vencord installer can load directly.

1. Set up a Vencord source checkout using https://docs.vencord.dev/installing/.
2. Extract this package so the folder is exactly `Vencord/src/userplugins/reactionLibrary/`. Its `index.tsx`, `native.ts`, and `runtime.js` must be directly inside that folder, without another nested `reactionLibrary` folder.
3. In the Vencord checkout, run `pnpm install --frozen-lockfile`, then `pnpm build`.
4. Run `pnpm inject` and select your Discord installation if that checkout is not already installed. Fully restart Discord.
5. Enable **ReactionLibrary** under **User Settings → Vencord → Plugins**, then restart once more if Vencord asks you to enable the chat button API.
6. Open a chat and click the new library button. Use **Add folder** to select your media folders.

Official custom-plugin instructions: https://docs.vencord.dev/installing/custom-plugins/.

## Features

- Files stay in their original folders; the library stores references and tags.
- Choose **Set save folder** in the library, then right click an image, video, or audio attachment and select **Add to reaction library**. The media is downloaded into that folder and indexed as a reference. Saving another file with the same name adds a number to its name.
- Desktop Discord uses the plugin's native folder picker and file reader. Selected folder paths are remembered in `reaction-library-folders.json` inside Discord's user-data directory, so they do not require browser folder permission renewal after a restart.
- Browser builds use the browser folder picker. Saved read permission may need to be approved again; the library automatically attempts restoration when opened and offers a restore button when needed.
- Search by file name, folder, and tags; filter by media type or folder; sort by name or import time.
- Click a card to send the original file immediately. Separate **Preview** buttons play audio/video first.
- Audio and video have **Send as voice**. Video also has **Send as GIF**. Conversion stays in memory; converted media is not saved to disk or to the library.
- Conversion continues after closing the picker, as long as Discord stays open. Progress returns when reopened, with a cancel button while conversion is in progress.
- Drag the upper-left corner to resize the picker. The size is remembered.
- Remove items or folders from the index without deleting original files.

Only select folders you want the plugin to read. The native helper rejects file reads outside those selected folders, including paths that escape through symbolic links.

## Limitations

Audio/video decoding depends on the client's codec support. Voice encoding requires WebCodecs Opus support. Some video audio tracks need an extraction pass that takes roughly the clip's duration. GIFs are scaled to at most 480 pixels on the longest side, with at most 900 frames; longer clips use fewer frames per second. Discord's upload and channel permission limits still apply.

Desktop folder scanning and file access use the included native helper, so a full client restart is required after installing or updating it. Other desktop wrappers must support Vencord native plugin helpers; browser clients need the File System Access API.

The bundled `runtime.js` includes the GIF encoder. Your friends do not need this project's development checkout or any additional GIF dependency. This package has no Equicord dependency.

Licensed under GPL-3.0-or-later; see `LICENSE`. The bundled gifenc component is MIT licensed; its license is included in `runtime.js`.
