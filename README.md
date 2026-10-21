# Reaction Library for Dorion and Equicord

The chat button opens a Discord themed library. The Dorion plugin's **Add folder** stores references to supported images, GIFs, videos, and audio files. Media stays in its original location. Folder scanning and indexing show live progress, and items appear after each batch of 20 references. The picker searches file names, folder paths, and user tags; filters by folder and media type; and sorts by name or import time. Clicking an item starts its upload and sends it to the current chat.

## Standalone Dorion plugin

Keep Dorion's built-in Equicord enabled. Copy **only** `dorion/reaction-library.js` into `%USERPROFILE%\dorion\plugins` on Windows (or open the plugins folder from Dorion settings), enable it in Dorion's plugin settings, and restart Dorion. This file contains its own styles and does not replace Equicord. It uses the built-in Equicord's upload API to send files, so Equicord must remain enabled. It appears as a button in chat; it does not appear in Equicord's plugin list.

If you installed the earlier custom Equicord bundle, remove `Equicord-ReactionLibrary.js` from Dorion's plugins folder and `Equicord-ReactionLibrary.css` from its themes folder before enabling this file.

Persistent references require Dorion's folder picker support. If this is unavailable, the picker reports it and does not copy files. After a restart, select a folder and click **Reconnect** if access needs to be granted again. Moving or deleting the original file makes its reference unavailable until its folder is selected again.

On the first library open after this update, a one-time cleanup removes old stored media copies, including unlisted leftovers from interrupted imports. It identifies actual Blob/File values, leaving file handles, folder handles, and reference tags intact. Items backed only by removed copies are also removed from the index. Original files on disk are untouched.

Image and video previews load only near the visible area, with at most three file reads in flight. Videos show a frame near the start without autoplay. The picker initially displays 60 items; **Show more** expands the list in batches. Unsupported video codecs retain a video icon.

Clicking a media card still sends the original file immediately. Video and audio cards also have a separate **Preview** button, which opens playback controls without sending. Both offer **Send as voice** to send a Discord voice message with duration and waveform metadata. Video cards and previews additionally offer **Send as GIF**. All conversion output is temporary upload data in memory: no converted media is saved to disk or to the library, and the original remains unchanged.

Voice conversion uses existing OGG Opus audio directly and encodes other decodable audio to mono Opus when Dorion supports WebCodecs encoding. For videos, it first tries direct audio decoding, then an in-memory capture of the video's audio track. The fallback takes roughly the video's duration, plays silently, and shows progress. Videos with no decodable audio track report an error. Channel voice-message permissions apply.

GIF conversion includes the full video's duration, scaled to at most 480 pixels on the longest side, with up to 10 frames per second. Long videos use fewer frames per second, up to 900 frames total. Frame progress and **Cancel conversion** are available. GIFs exceeding a 64 MiB conversion buffer stop with an error; Discord's own upload limit also applies. GIF encoding is bundled in the single plugin file and requires no runtime download.

Closing the library leaves conversions and uploads running while Dorion remains open. A dot on the chat button indicates a pending send; hovering shows the current status. Reopen the library to see progress or use **Cancel conversion**. Completion sends to the original selected chat even if you switch chats. Background completion or errors show a toast, and a library window reopened during the job stays open. Closing Dorion itself ends these in-memory jobs.

The standalone source is `src/reaction-library.js`. After editing it, run `node build.mjs` to regenerate `dorion/reaction-library.js` using the GIF encoder and build tools already installed in the adjacent Equicord checkout. Only the generated file is installed in Dorion.

Drag the library's upper-left corner to resize it. The selected size is remembered, the media grid adapts to the width, and the window stays within the screen. The resize handle also supports arrow keys when focused.

Use an item's **Remove** button to remove it from the library, or choose a folder and click **Remove folder** to remove all its indexed items, including subfolders. These operations leave original files untouched. The folder index is refreshed when you add that folder again; it does not watch the filesystem continuously.

## Equicord source plugin

For a normal Equicord desktop build, copy `index.tsx` and `styles.css` to `src/userplugins/reactionLibrary` in an Equicord checkout and build that checkout. With Equicord's dependencies installed in an adjacent `Equicord` folder, run `node check.mjs` here to type check the source plugin without copying files.

The Equicord source plugin still uses copied media and does not include the standalone Dorion plugin's conversion features. GIFs are included in the image filter. Run `node --test test/standalone.test.cjs` to check large reference imports, interrupted batches, preview limits, library removal, conversion outputs, and send routing.

The plugin metadata currently uses `Devs.Ven` as a compilation placeholder because no contributor identity was supplied. Replace it with your entry in Equicord's developer list before distributing the plugin.

## Development and license

Development currently uses dependencies from an adjacent Equicord checkout: clone this repository and Equicord side by side, then install Equicord's dependencies using its documented pnpm workflow. Run `node build.mjs` to build the standalone plugin, `node --test test/standalone.test.cjs` to run its tests, and Equicord's ESLint executable with this repository as the working directory to lint `src/reaction-library.js`.

Licensed under GPL-3.0-or-later. The generated standalone plugin also includes gifenc under its MIT license; that license is embedded in the generated file. The standalone plugin is the actively developed version; the Equicord source plugin is an earlier implementation.
